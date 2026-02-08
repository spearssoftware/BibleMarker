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
/// Returns the path where we should store the SQLite database for sync.
///
/// First tries the standard NSFileManager API. If it returns nil (which can happen
/// when the Production iCloud environment hasn't propagated for Developer ID builds),
/// falls back to checking the known Mobile Documents path on disk.
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn get_icloud_container_url() -> Result<String, String> {
    use std::ffi::CStr;
    
    unsafe {
        // Get NSFileManager.defaultManager
        let file_manager: *mut objc::runtime::Object = msg_send![class!(NSFileManager), defaultManager];
        if file_manager.is_null() {
            return Err("Failed to get NSFileManager".to_string());
        }
        
        // Check if iCloud is signed in
        let token: *mut objc::runtime::Object = msg_send![file_manager, ubiquityIdentityToken];
        let has_token = !token.is_null();
        
        // Create container identifier NSString
        // Note: alloc+init creates an owned object that we must release
        let container_id = "iCloud.app.biblemarker";
        let ns_string: *mut objc::runtime::Object = msg_send![class!(NSString), alloc];
        let container_id_cstr = std::ffi::CString::new(container_id).unwrap();
        let ns_container_id: *mut objc::runtime::Object = msg_send![
            ns_string,
            initWithUTF8String: container_id_cstr.as_ptr()
        ];
        
        // Get URL for ubiquity container
        // Note: This returns an autoreleased object, no need to release
        let url: *mut objc::runtime::Object = msg_send![
            file_manager,
            URLForUbiquityContainerIdentifier: ns_container_id
        ];
        
        // Release the container ID string now that we're done with it
        let _: () = msg_send![ns_container_id, release];
        
        if url.is_null() {
            // Fallback: the API can return nil for Developer ID builds when Apple's
            // Production iCloud environment hasn't propagated the container yet.
            // Check if the container directory exists on disk (created by a prior
            // Xcode development build or iCloud sync from another device).
            let home = std::env::var("HOME").unwrap_or_default();
            let fallback_path = format!("{}/Library/Mobile Documents/iCloud~app~biblemarker", home);
            if std::path::Path::new(&fallback_path).exists() && has_token {
                eprintln!("[iCloud] API returned nil but container exists on disk, using fallback: {}", fallback_path);
                return Ok(fallback_path);
            }
            
            return Err(
                "iCloud container not available. Make sure iCloud Drive is enabled and you are signed in.".to_string()
            );
        }
        
        // Get the path string from URL
        // Note: This returns an autoreleased object, no need to release
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

/// Tauri command to get the iCloud database path
/// Returns the full path where the SQLite database should be stored
#[command]
pub fn get_icloud_database_path() -> Result<String, String> {
    // Use background thread for container access (Apple recommends this)
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || { let _ = tx.send(get_icloud_container_url()); });
    let container_path = rx.recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "iCloud path check timed out".to_string())??;
    
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
/// Returns an ISO 8601 formatted string (e.g., "2024-01-01T12:00:00Z")
fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    
    chrono_lite_from_secs(duration.as_secs())
}

/// Converts Unix timestamp (seconds since epoch) to ISO 8601 formatted string
fn chrono_lite_from_secs(secs: u64) -> String {
    // Convert Unix timestamp to ISO 8601 format
    // This is a simplified implementation that handles dates from 1970 onwards
    const SECS_PER_MIN: u64 = 60;
    const SECS_PER_HOUR: u64 = 3600;
    const SECS_PER_DAY: u64 = 86400;
    
    // Days in each month (non-leap year)
    const DAYS_IN_MONTH: [u64; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    
    fn is_leap_year(year: u64) -> bool {
        (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
    }
    
    fn days_in_year(year: u64) -> u64 {
        if is_leap_year(year) { 366 } else { 365 }
    }
    
    // Calculate time components
    let time_of_day = secs % SECS_PER_DAY;
    let hours = time_of_day / SECS_PER_HOUR;
    let minutes = (time_of_day % SECS_PER_HOUR) / SECS_PER_MIN;
    let seconds = time_of_day % SECS_PER_MIN;
    
    // Calculate date from days since epoch
    let mut days = secs / SECS_PER_DAY;
    let mut year = 1970u64;
    
    while days >= days_in_year(year) {
        days -= days_in_year(year);
        year += 1;
    }
    
    // Find month and day
    let mut month = 0usize;
    while month < 12 {
        let days_this_month = if month == 1 && is_leap_year(year) {
            29
        } else {
            DAYS_IN_MONTH[month]
        };
        
        if days < days_this_month {
            break;
        }
        days -= days_this_month;
        month += 1;
    }
    
    // Clamp month to valid range (0-11) in case of any edge cases
    let month = month.min(11);
    
    let day = days + 1; // Days are 1-indexed
    let month = month + 1; // Months are 1-indexed (1-12)
    
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
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
    
    #[test]
    fn test_chrono_lite_now_format() {
        let timestamp = chrono_lite_now();
        
        // Should match ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
        assert_eq!(timestamp.len(), 20, "Timestamp should be 20 characters");
        assert!(timestamp.ends_with('Z'), "Timestamp should end with Z");
        assert_eq!(&timestamp[4..5], "-", "Should have dash after year");
        assert_eq!(&timestamp[7..8], "-", "Should have dash after month");
        assert_eq!(&timestamp[10..11], "T", "Should have T separator");
        assert_eq!(&timestamp[13..14], ":", "Should have colon after hours");
        assert_eq!(&timestamp[16..17], ":", "Should have colon after minutes");
        
        // Year should be reasonable (2020-2100)
        let year: u32 = timestamp[0..4].parse().unwrap();
        assert!(year >= 2020 && year <= 2100, "Year should be reasonable");
        
        // Month should be 01-12
        let month: u32 = timestamp[5..7].parse().unwrap();
        assert!(month >= 1 && month <= 12, "Month should be 1-12, got {}", month);
        
        // Day should be 01-31
        let day: u32 = timestamp[8..10].parse().unwrap();
        assert!(day >= 1 && day <= 31, "Day should be 1-31, got {}", day);
    }
    
    #[test]
    fn test_chrono_lite_known_timestamps() {
        // Unix epoch: January 1, 1970 00:00:00 UTC
        assert_eq!(
            chrono_lite_from_secs(0),
            "1970-01-01T00:00:00Z",
            "Unix epoch should be January 1, 1970"
        );
        
        // January 31, 1970 23:59:59 UTC (last second of January)
        // 30 days * 86400 + 23*3600 + 59*60 + 59 = 2592000 + 82800 + 3540 + 59 = 2678399
        assert_eq!(
            chrono_lite_from_secs(2678399),
            "1970-01-31T23:59:59Z",
            "Should be last second of January 31, 1970"
        );
        
        // February 1, 1970 00:00:00 UTC (first second of February)
        // 31 days * 86400 = 2678400
        assert_eq!(
            chrono_lite_from_secs(2678400),
            "1970-02-01T00:00:00Z",
            "Should be first second of February 1, 1970"
        );
        
        // December 31, 1970 00:00:00 UTC
        // 364 days * 86400 = 31449600
        assert_eq!(
            chrono_lite_from_secs(31449600),
            "1970-12-31T00:00:00Z",
            "Should be December 31, 1970"
        );
        
        // January 1, 1971 00:00:00 UTC
        // 365 days * 86400 = 31536000
        assert_eq!(
            chrono_lite_from_secs(31536000),
            "1971-01-01T00:00:00Z",
            "Should be January 1, 1971"
        );
        
        // February 29, 2000 00:00:00 UTC (leap year)
        // This is a known timestamp: 951782400
        assert_eq!(
            chrono_lite_from_secs(951782400),
            "2000-02-29T00:00:00Z",
            "Should be February 29, 2000 (leap year)"
        );
        
        // March 1, 2000 00:00:00 UTC (day after leap day)
        // 951782400 + 86400 = 951868800
        assert_eq!(
            chrono_lite_from_secs(951868800),
            "2000-03-01T00:00:00Z",
            "Should be March 1, 2000 (day after leap day)"
        );
        
        // A known recent date: January 1, 2024 00:00:00 UTC = 1704067200
        assert_eq!(
            chrono_lite_from_secs(1704067200),
            "2024-01-01T00:00:00Z",
            "Should be January 1, 2024"
        );
        
        // End of month boundaries
        // February 28, 2023 (non-leap year) 23:59:59
        // February 28, 2023 = 1677542400 (midnight)
        // + 23*3600 + 59*60 + 59 = 86399
        assert_eq!(
            chrono_lite_from_secs(1677628799),
            "2023-02-28T23:59:59Z",
            "Should be last second of February 28, 2023"
        );
        
        // March 1, 2023 00:00:00 (first second after February in non-leap year)
        assert_eq!(
            chrono_lite_from_secs(1677628800),
            "2023-03-01T00:00:00Z",
            "Should be first second of March 1, 2023"
        );
    }
}
