//! iCloud and Sync Integration Module
//!
//! Provides:
//! - iCloud container detection for sync folder on macOS/iOS
//! - Sync folder path resolution

use serde::{Deserialize, Serialize};
use tauri::command;

#[cfg(any(target_os = "macos", target_os = "ios"))]
use objc2_foundation::{NSFileManager, NSString};

/// iCloud availability status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ICloudStatus {
    /// Whether iCloud is available on this device
    pub available: bool,
    /// Path to the iCloud container (if available)
    pub container_path: Option<String>,
    /// Error message if iCloud is not available
    pub error: Option<String>,
}

/// Get iCloud container URL for the app.
///
/// First tries the standard NSFileManager API. If it returns nil (which can happen
/// when the Production iCloud environment hasn't propagated for Developer ID builds),
/// falls back to checking the known Mobile Documents path on disk.
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn get_icloud_container_url() -> Result<String, String> {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;

    let file_manager = NSFileManager::defaultManager();

    let has_token = unsafe {
        let token: *mut AnyObject = objc2::msg_send![&file_manager, ubiquityIdentityToken];
        !token.is_null()
    };

    let ns_container_id = NSString::from_str("iCloud.app.biblemarker");

    let url: Option<Retained<AnyObject>> = unsafe {
        objc2::msg_send![
            &file_manager,
            URLForUbiquityContainerIdentifier: &*ns_container_id
        ]
    };

    match url {
        Some(url) => {
            let path: Option<Retained<NSString>> = unsafe { objc2::msg_send![&url, path] };
            match path {
                Some(path) => Ok(path.to_string()),
                None => Err("Failed to get path from iCloud URL".to_string()),
            }
        }
        None => {
            let home = std::env::var("HOME").unwrap_or_default();
            let fallback_path = format!("{}/Library/Mobile Documents/iCloud~app~biblemarker", home);
            if std::path::Path::new(&fallback_path).exists() && has_token {
                use std::sync::Once;
                static LOG_ONCE: Once = Once::new();
                LOG_ONCE.call_once(|| {
                    eprintln!("[iCloud] API returned nil but container exists on disk, using fallback: {}", fallback_path);
                });
                return Ok(fallback_path);
            }

            Err(
                "iCloud container not available. Make sure iCloud Drive is enabled and you are signed in.".to_string()
            )
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn get_icloud_container_url() -> Result<String, String> {
    Err("iCloud is only available on macOS and iOS".to_string())
}

/// Tauri command to check iCloud availability.
/// Runs the container check on a background thread as Apple recommends.
#[command]
pub fn check_icloud_status() -> ICloudStatus {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(get_icloud_container_url());
    });

    match rx.recv_timeout(std::time::Duration::from_secs(10)) {
        Ok(Ok(path)) => ICloudStatus {
            available: true,
            container_path: Some(path),
            error: None,
        },
        Ok(Err(err)) => ICloudStatus {
            available: false,
            container_path: None,
            error: Some(err),
        },
        Err(_) => ICloudStatus {
            available: false,
            container_path: None,
            error: Some("iCloud check timed out after 10 seconds".to_string()),
        },
    }
}

/// Get the path to the sync folder inside the iCloud container.
/// Returns `iCloud_container/Documents/sync/` and ensures it exists.
/// Used for storing journal files that iCloud syncs across devices.
#[command]
pub fn get_sync_folder_path() -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(get_icloud_container_url());
    });
    let container_path = rx
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "iCloud path check timed out".to_string())??;

    let sync_path = format!("{}/Documents/sync", container_path);

    std::fs::create_dir_all(&sync_path)
        .map_err(|e| format!("Failed to create sync folder: {}", e))?;

    Ok(sync_path)
}

/// Write a file to the sync folder.
///
/// On macOS: uses std::fs::write directly (iCloud daemon detects changes via FSEvents).
/// On iOS: writes to a temp file first, then uses NSFileManager.setUbiquitous to move
/// it into the iCloud container, which properly notifies the iCloud daemon.
#[command]
pub fn write_sync_file(path: String, content: String) -> Result<(), String> {
    // Basic path validation — must be within the iCloud app container
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        if !path.contains("iCloud~app~biblemarker") && !path.contains("iCloud.app.biblemarker") {
            return Err(format!(
                "Path not within BibleMarker iCloud container: {}",
                path
            ));
        }
    }

    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    #[cfg(target_os = "ios")]
    {
        return write_via_set_ubiquitous(&path, content.as_bytes());
    }

    #[cfg(not(target_os = "ios"))]
    {
        std::fs::write(&path, content.as_bytes())
            .map_err(|e| format!("Failed to write file {}: {}", path, e))
    }
}

/// iOS: write via temp file + NSFileManager.setUbiquitous to properly notify iCloud.
#[cfg(target_os = "ios")]
fn write_via_set_ubiquitous(dest_path: &str, content: &[u8]) -> Result<(), String> {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;

    // 1. Write to temp file
    let temp_dir = std::env::temp_dir();
    let filename = std::path::Path::new(dest_path)
        .file_name()
        .ok_or("No filename in path")?
        .to_string_lossy()
        .to_string();
    // Use a unique temp name to avoid collisions
    let temp_filename = format!("bm_sync_{}", filename);
    let temp_path = temp_dir.join(&temp_filename);

    std::fs::write(&temp_path, content).map_err(|e| format!("Failed to write temp file: {}", e))?;

    // 2. Remove existing file at destination (setUbiquitous fails if dest exists)
    let _ = std::fs::remove_file(dest_path);

    // 3. Create NSURLs
    let temp_ns = NSString::from_str(&temp_path.to_string_lossy());
    let dest_ns = NSString::from_str(dest_path);

    let temp_url: Retained<AnyObject> =
        unsafe { objc2::msg_send_id![objc2::class!(NSURL), fileURLWithPath: &*temp_ns] };
    let dest_url: Retained<AnyObject> =
        unsafe { objc2::msg_send_id![objc2::class!(NSURL), fileURLWithPath: &*dest_ns] };

    // 4. Move into iCloud container via setUbiquitous
    let file_manager = NSFileManager::defaultManager();
    let mut error: *mut AnyObject = std::ptr::null_mut();

    let success: bool = unsafe {
        objc2::msg_send![
            &file_manager,
            setUbiquitous: true,
            itemAtURL: &*temp_url,
            destinationURL: &*dest_url,
            error: &mut error
        ]
    };

    if !success {
        let error_desc = if !error.is_null() {
            let desc: Option<Retained<NSString>> =
                unsafe { objc2::msg_send_id![error, localizedDescription] };
            desc.map(|s| s.to_string())
                .unwrap_or_else(|| "Unknown".to_string())
        } else {
            "Unknown error".to_string()
        };
        // Clean up temp file
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!("setUbiquitous failed: {}", error_desc));
    }

    Ok(())
}

/// List the contents of the sync folder using Rust stdlib I/O.
/// Returns a JSON string with the directory listing for diagnostics.
/// This bypasses the Tauri JS FS plugin to show what Rust actually sees on disk.
#[command]
pub fn list_sync_dir(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(format!("{{\"exists\":false,\"path\":\"{}\"}}", path));
    }

    let mut entries = vec![];
    match std::fs::read_dir(&path) {
        Ok(dir) => {
            for entry in dir.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                entries.push(format!("{{\"name\":\"{}\",\"dir\":{}}}", name, is_dir));
            }
        }
        Err(e) => return Err(format!("Failed to read dir {}: {}", path, e)),
    }

    Ok(format!(
        "{{\"exists\":true,\"path\":\"{}\",\"entries\":[{}]}}",
        path,
        entries.join(",")
    ))
}

/// Delete the local database files so a fresh DB can be created.
/// Called from JS when corruption is detected at runtime.
#[command]
pub fn delete_local_database(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;

    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot determine app data dir: {}", e))?;

    let db_file = app_data.join("biblemarker.db");
    let wal_file = app_data.join("biblemarker.db-wal");
    let shm_file = app_data.join("biblemarker.db-shm");

    for f in [&db_file, &wal_file, &shm_file] {
        if f.exists() {
            std::fs::remove_file(f)
                .map_err(|e| format!("Failed to delete {}: {}", f.display(), e))?;
        }
    }

    Ok("Local database deleted".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_icloud_status_serialization() {
        let status = ICloudStatus {
            available: true,
            container_path: Some("/path/to/container".into()),
            error: None,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("available"));
        assert!(json.contains("/path/to/container"));
    }
}
