//! Database maintenance commands (corruption recovery, etc.).
//! These are independent of any sync transport.

use std::path::{Path, PathBuf};
use tauri::command;

/// Suffixes of the sidecar files SQLite keeps beside a database in WAL mode.
/// Shared with `download.rs`, which clears the same set before replacing a
/// bundled DB, so the two can't drift apart.
pub(crate) const SQLITE_SIDECAR_SUFFIXES: [&str; 2] = ["-wal", "-shm"];

/// Suffix of the marker file recording which app version installed a bundled
/// resource. It lives next to the installed file; deleting a database also
/// drops its marker so a recovery reinstall can never be skipped.
pub(crate) const INSTALL_MARKER_SUFFIX: &str = ".installed";

/// The marker file that sits next to an installed bundled resource.
pub(crate) fn marker_path(dest: &Path) -> PathBuf {
    let mut name = dest
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    name.push(INSTALL_MARKER_SUFFIX);
    dest.with_file_name(name)
}

/// Delete `name` and its sidecars from `app_data`.
///
/// The sidecars have to go with the database: a WAL left beside a replacement
/// file describes pages that file doesn't have, which SQLite reports as
/// "file is not a database". Absent files are not an error.
fn delete_database_files(app_data: &Path, name: &str) -> Result<(), String> {
    for suffix in std::iter::once("").chain(SQLITE_SIDECAR_SUFFIXES) {
        let f = app_data.join(format!("{name}{suffix}"));
        if f.exists() {
            std::fs::remove_file(&f)
                .map_err(|e| format!("Failed to delete {}: {}", f.display(), e))?;
        }
    }
    // Also drop the install marker, so a recovery reinstall actually copies a
    // fresh file instead of hitting install_bundled_module's skip path.
    let _ = std::fs::remove_file(marker_path(&app_data.join(name)));
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
/// `install_bundled_module` skips a file whose install marker is current and
/// whose structure validates, so a damaged file could otherwise survive.
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
    fn marker_path_sits_next_to_the_file() {
        assert_eq!(
            marker_path(Path::new("/data/gnosis-lite.db")),
            Path::new("/data/gnosis-lite.db.installed")
        );
    }

    #[test]
    fn deletes_database_with_its_sidecars() {
        let dir = std::env::temp_dir().join(format!("biblemarker-dbm-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for suffix in ["", "-wal", "-shm", ".installed"] {
            std::fs::write(dir.join(format!("gnosis-lite.db{suffix}")), b"x").unwrap();
        }
        // A neighbouring database must survive.
        std::fs::write(dir.join("biblemarker.db"), b"keep").unwrap();

        delete_database_files(&dir, "gnosis-lite.db").unwrap();

        for suffix in ["", "-wal", "-shm", ".installed"] {
            assert!(!dir.join(format!("gnosis-lite.db{suffix}")).exists());
        }
        assert!(dir.join("biblemarker.db").exists());

        // Absent files are not an error.
        delete_database_files(&dir, "gnosis-lite.db").unwrap();

        std::fs::remove_dir_all(&dir).ok();
    }
}
