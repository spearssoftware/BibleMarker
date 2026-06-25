//! Database maintenance commands (corruption recovery, etc.).
//! These are independent of any sync transport.

use tauri::command;

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
