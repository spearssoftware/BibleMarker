//! iCloud and Sync Integration Module
//!
//! Provides:
//! - iCloud container detection for sync folder on macOS/iOS
//! - Migration from old iCloud-database approach to local storage
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

/// Result of database migration from iCloud to local storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationResult {
    /// Whether migration was performed
    pub migrated: bool,
    /// Human-readable description of what happened
    pub message: String,
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
        let token: *mut AnyObject =
            objc2::msg_send![&file_manager, ubiquityIdentityToken];
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
            let path: Option<Retained<NSString>> = unsafe {
                objc2::msg_send![&url, path]
            };
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
    let container_path = rx.recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "iCloud path check timed out".to_string())??;
    
    let sync_path = format!("{}/Documents/sync", container_path);
    
    std::fs::create_dir_all(&sync_path)
        .map_err(|e| format!("Failed to create sync folder: {}", e))?;
    
    Ok(sync_path)
}

/// Migrate the database from the old iCloud container location to local app storage.
///
/// The old approach stored `biblemarker.db` directly in the iCloud Documents container,
/// which causes corruption because iCloud syncs the DB/WAL/SHM files independently.
/// This command copies that database to the local app data directory (if it hasn't
/// been migrated already).
#[command]
pub fn migrate_from_icloud(app_handle: tauri::AppHandle) -> MigrationResult {
    use tauri::Manager;
    
    let app_data = match app_handle.path().app_data_dir() {
        Ok(p) => p,
        Err(e) => return MigrationResult {
            migrated: false,
            message: format!("Cannot determine app data dir: {}", e),
        },
    };
    
    let local_db = app_data.join("biblemarker.db");
    
    // If local DB already exists and has content, skip migration
    if local_db.exists() {
        if let Ok(meta) = std::fs::metadata(&local_db) {
            if meta.len() > 0 {
                return MigrationResult {
                    migrated: false,
                    message: "Local database already exists".into(),
                };
            }
        }
    }
    
    // Try to find the old iCloud database
    let container_path = match get_icloud_container_url() {
        Ok(p) => p,
        Err(e) => return MigrationResult {
            migrated: false,
            message: format!("iCloud unavailable: {}", e),
        },
    };
    
    let icloud_db = std::path::PathBuf::from(&container_path).join("Documents/biblemarker.db");
    
    if !icloud_db.exists() {
        return MigrationResult {
            migrated: false,
            message: "No iCloud database found to migrate".into(),
        };
    }
    
    // Ensure local directory exists
    if let Err(e) = std::fs::create_dir_all(&app_data) {
        return MigrationResult {
            migrated: false,
            message: format!("Failed to create app data dir: {}", e),
        };
    }
    
    // Copy only the main .db file — do NOT copy WAL/SHM files.
    // iCloud syncs WAL/SHM independently from the main DB, which causes corruption.
    if let Err(e) = std::fs::copy(&icloud_db, &local_db) {
        return MigrationResult {
            migrated: false,
            message: format!("Failed to copy database: {}", e),
        };
    }
    
    // Verify the copied database isn't corrupt
    match rusqlite::Connection::open(&local_db) {
        Ok(conn) => {
            match conn.query_row("PRAGMA integrity_check(1)", [], |row| row.get::<_, String>(0)) {
                Ok(ref status) if status == "ok" => {
                    eprintln!(
                        "[iCloud] Migrated database from {} to {} (integrity: ok)",
                        icloud_db.display(),
                        local_db.display()
                    );
                    MigrationResult {
                        migrated: true,
                        message: "Database migrated from iCloud to local storage".into(),
                    }
                }
                Ok(status) => {
                    eprintln!("[iCloud] Migrated database is corrupt: {}", status);
                    drop(conn);
                    let _ = std::fs::remove_file(&local_db);
                    MigrationResult {
                        migrated: false,
                        message: format!("iCloud database is corrupt ({}), starting fresh", status),
                    }
                }
                Err(e) => {
                    eprintln!("[iCloud] Integrity check failed: {}", e);
                    drop(conn);
                    let _ = std::fs::remove_file(&local_db);
                    MigrationResult {
                        migrated: false,
                        message: format!("iCloud database integrity check failed ({}), starting fresh", e),
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("[iCloud] Cannot open migrated database: {}", e);
            let _ = std::fs::remove_file(&local_db);
            MigrationResult {
                migrated: false,
                message: format!("Migrated database unreadable ({}), starting fresh", e),
            }
        }
    }
}

/// Delete the local database files so a fresh DB can be created.
/// Called from JS when corruption is detected at runtime.
#[command]
pub fn delete_local_database(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    
    let app_data = app_handle.path().app_data_dir()
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
    
    #[test]
    fn test_migration_result_serialization() {
        let result = MigrationResult {
            migrated: true,
            message: "Done".into(),
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("migrated"));
    }
}
