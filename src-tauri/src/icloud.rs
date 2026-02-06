//! iCloud Integration Module
//!
//! Provides access to iCloud container for database sync on macOS/iOS.
//! Uses Objective-C runtime to call NSFileManager APIs.

use serde::{Deserialize, Serialize};
use tauri::command;

#[cfg(any(target_os = "macos", target_os = "ios"))]
use objc::{msg_send, sel, sel_impl, class};

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

/// Sync status for UI display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    /// Current sync state
    pub state: SyncState,
    /// Last sync timestamp (ISO string)
    pub last_sync: Option<String>,
    /// Number of pending changes
    pub pending_changes: u32,
    /// Error message if sync failed
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncState {
    /// Sync is idle, all changes synced
    Synced,
    /// Currently syncing
    Syncing,
    /// Offline, changes pending
    Offline,
    /// Sync error occurred
    Error,
    /// iCloud not available
    Unavailable,
}

/// Get iCloud container URL for the app
/// Returns the path where we should store the SQLite database for sync
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn get_icloud_container_url() -> Result<String, String> {
    use std::ffi::CStr;
    
    unsafe {
        // Get NSFileManager.defaultManager
        let file_manager: *mut objc::runtime::Object = msg_send![class!(NSFileManager), defaultManager];
        if file_manager.is_null() {
            return Err("Failed to get NSFileManager".to_string());
        }
        
        // Create container identifier NSString
        let container_id = "iCloud.com.biblemarker";
        let ns_string: *mut objc::runtime::Object = msg_send![class!(NSString), alloc];
        let container_id_cstr = std::ffi::CString::new(container_id).unwrap();
        let ns_container_id: *mut objc::runtime::Object = msg_send![
            ns_string,
            initWithUTF8String: container_id_cstr.as_ptr()
        ];
        
        // Get URL for ubiquity container
        let url: *mut objc::runtime::Object = msg_send![
            file_manager,
            URLForUbiquityContainerIdentifier: ns_container_id
        ];
        
        if url.is_null() {
            return Err("iCloud container not available. Make sure iCloud is enabled and the user is signed in.".to_string());
        }
        
        // Get the path string from URL
        let path: *mut objc::runtime::Object = msg_send![url, path];
        if path.is_null() {
            return Err("Failed to get path from iCloud URL".to_string());
        }
        
        // Convert NSString to Rust String
        let utf8: *const i8 = msg_send![path, UTF8String];
        if utf8.is_null() {
            return Err("Failed to convert path to UTF8".to_string());
        }
        
        let path_str = CStr::from_ptr(utf8).to_string_lossy().into_owned();
        
        Ok(path_str)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn get_icloud_container_url() -> Result<String, String> {
    Err("iCloud is only available on macOS and iOS".to_string())
}

/// Tauri command to check iCloud availability
#[command]
pub fn check_icloud_status() -> ICloudStatus {
    match get_icloud_container_url() {
        Ok(path) => ICloudStatus {
            available: true,
            container_path: Some(path),
            error: None,
        },
        Err(err) => ICloudStatus {
            available: false,
            container_path: None,
            error: Some(err),
        },
    }
}

/// Tauri command to get the iCloud database path
/// Returns the full path where the SQLite database should be stored
#[command]
pub fn get_icloud_database_path() -> Result<String, String> {
    let container_path = get_icloud_container_url()?;
    
    // Store database in Documents subdirectory of iCloud container
    let db_path = format!("{}/Documents/biblemarker.db", container_path);
    
    // Ensure the Documents directory exists
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        let docs_dir = format!("{}/Documents", container_path);
        std::fs::create_dir_all(&docs_dir)
            .map_err(|e| format!("Failed to create iCloud Documents directory: {}", e))?;
    }
    
    Ok(db_path)
}

/// Tauri command to get current sync status
#[command]
pub fn get_sync_status() -> SyncStatus {
    // For now, return a placeholder status
    // This will be enhanced when we implement full sync logic
    match get_icloud_container_url() {
        Ok(_) => SyncStatus {
            state: SyncState::Synced,
            last_sync: Some(chrono_lite_now()),
            pending_changes: 0,
            error: None,
        },
        Err(_) => SyncStatus {
            state: SyncState::Unavailable,
            last_sync: None,
            pending_changes: 0,
            error: Some("iCloud not available".to_string()),
        },
    }
}

/// Simple timestamp function without full chrono dependency
fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    
    // Return Unix timestamp as ISO-ish string
    format!("{}", duration.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_sync_status_serialization() {
        let status = SyncStatus {
            state: SyncState::Synced,
            last_sync: Some("2024-01-01T00:00:00Z".to_string()),
            pending_changes: 0,
            error: None,
        };
        
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("synced"));
    }
}
