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

/// Write a file to the sync folder using Rust stdlib I/O.
///
/// On iOS, the Tauri JS FS plugin may write to the app sandbox rather than
/// the actual iCloud container path. Using a Rust command with std::fs::write
/// bypasses this and writes directly to the path returned by get_sync_folder_path.
#[command]
pub fn write_sync_file(path: String, content: String) -> Result<(), String> {
    // Basic path validation — must be within the iCloud app container
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        if !path.contains("iCloud~app~biblemarker") && !path.contains("iCloud.app.biblemarker") {
            return Err(format!("Path not within BibleMarker iCloud container: {}", path));
        }
    }

    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Failed to write file {}: {}", path, e))
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
