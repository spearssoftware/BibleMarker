//! Database maintenance commands (corruption recovery, etc.).
//! These are independent of any sync transport.

use std::path::Path;
use tauri::command;

/// Delete `name` and its `-wal`/`-shm` sidecars from `app_data`.
///
/// The sidecars have to go with the database: a WAL left beside a replacement
/// file describes pages that file doesn't have, which SQLite reports as
/// "file is not a database". Absent files are not an error.
fn delete_database_files(app_data: &Path, name: &str) -> Result<(), String> {
    for suffix in ["", "-wal", "-shm"] {
        let f = app_data.join(format!("{name}{suffix}"));
        if f.exists() {
            std::fs::remove_file(&f)
                .map_err(|e| format!("Failed to delete {}: {}", f.display(), e))?;
        }
    }
    Ok(())
}

fn app_data_dir(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;

    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot determine app data dir: {}", e))
}

/// Delete the local database files so a fresh DB can be created.
/// Called from JS when corruption is detected at runtime.
#[command]
pub fn delete_local_database(app_handle: tauri::AppHandle) -> Result<String, String> {
    delete_database_files(&app_data_dir(&app_handle)?, "biblemarker.db")?;
    Ok("Local database deleted".into())
}

/// Delete the bundled reference database so the next install call lays down a
/// clean copy from app resources. Called from JS when the DB fails to open —
/// `install_bundled_module` skips a file whose hash already matches the bundled
/// copy, so a damaged sidecar pair would otherwise survive forever.
///
/// Takes no filename: the app data dir also holds the user's own database, and
/// a caller-supplied path would make this a delete-anything command.
#[command]
pub fn delete_gnosis_database(app_handle: tauri::AppHandle) -> Result<String, String> {
    delete_database_files(&app_data_dir(&app_handle)?, "gnosis-lite.db")?;
    Ok("Gnosis database deleted".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deletes_database_with_its_sidecars() {
        let dir = std::env::temp_dir().join(format!("biblemarker-dbm-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for suffix in ["", "-wal", "-shm"] {
            std::fs::write(dir.join(format!("gnosis-lite.db{suffix}")), b"x").unwrap();
        }
        // A neighbouring database must survive.
        std::fs::write(dir.join("biblemarker.db"), b"keep").unwrap();

        delete_database_files(&dir, "gnosis-lite.db").unwrap();

        for suffix in ["", "-wal", "-shm"] {
            assert!(!dir.join(format!("gnosis-lite.db{suffix}")).exists());
        }
        assert!(dir.join("biblemarker.db").exists());

        // Absent files are not an error.
        delete_database_files(&dir, "gnosis-lite.db").unwrap();

        std::fs::remove_dir_all(&dir).ok();
    }
}
