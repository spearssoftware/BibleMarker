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
/// Uses std::fs::write directly on all platforms — the iCloud daemon detects changes
/// via FSEvents. create_dir_all ensures the parent directory exists first.
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

/// Diagnostic: write a test file to the iCloud container and verify it lands on disk.
/// Returns a JSON object with detailed results for each step.
#[command]
pub fn test_icloud_write() -> String {
    let mut results: Vec<String> = vec![];

    // Step 1: get the container path
    let container_path = match get_icloud_container_url() {
        Ok(p) => p,
        Err(e) => {
            return format!("{{\"error\":\"get_icloud_container_url failed: {}\"}}", e);
        }
    };
    results.push(format!("\"container\":\"{}\"", container_path));

    let sync_path = format!("{}/Documents/sync", container_path);
    let test_content = b"biblemarker_write_test";

    // Test A: write file directly in sync root (known to work)
    let root_file = format!("{}/bm_test_root.txt", sync_path);
    let root_write = std::fs::write(&root_file, test_content)
        .map(|_| "ok")
        .unwrap_or("err");
    let root_visible = std::fs::read_dir(&sync_path)
        .ok()
        .map(|d| d.flatten().any(|e| e.file_name() == "bm_test_root.txt"))
        .unwrap_or(false);
    results.push(format!(
        "\"root_write\":\"{}\",\"root_visible\":{}",
        root_write, root_visible
    ));
    let _ = std::fs::remove_file(&root_file);

    // Test B: create subdirectory with create_dir_all, then write into it
    let sub_dir = format!("{}/bm_test_subdir", sync_path);
    let sub_file = format!("{}/bm_test_subdir/test.txt", sync_path);
    let mkdir_result = std::fs::create_dir_all(&sub_dir)
        .map(|_| "ok")
        .unwrap_or("err");
    let dir_visible = std::fs::read_dir(&sync_path)
        .ok()
        .map(|d| d.flatten().any(|e| e.file_name() == "bm_test_subdir"))
        .unwrap_or(false);
    let sub_write = std::fs::write(&sub_file, test_content)
        .map(|_| "ok")
        .unwrap_or("err");
    let sub_file_visible = std::fs::read_dir(&sub_dir)
        .ok()
        .map(|d| d.flatten().any(|e| e.file_name() == "test.txt"))
        .unwrap_or(false);
    results.push(format!(
        "\"mkdir\":\"{}\",\"dir_visible\":{},\"sub_write\":\"{}\",\"sub_file_visible\":{}",
        mkdir_result, dir_visible, sub_write, sub_file_visible
    ));
    let _ = std::fs::remove_file(&sub_file);
    let _ = std::fs::remove_dir(&sub_dir);

    format!("{{{}}}", results.join(","))
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
