use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// Download a file from `url` and save it to `dest_path`.
/// Creates parent directories if needed.
#[tauri::command]
pub async fn download_file(url: String, dest_path: String) -> Result<(), String> {
    let path = PathBuf::from(&dest_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    std::fs::write(&path, &bytes).map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(())
}

/// Copy a bundled resource file to `dest_path` if it doesn't already exist.
/// `resource_name` is the filename relative to the resources directory (e.g. "sword-NASB.zip").
#[tauri::command]
pub async fn install_bundled_module(
    app: tauri::AppHandle,
    resource_name: String,
    dest_path: String,
) -> Result<(), String> {
    let dest = PathBuf::from(&dest_path);

    // Skip if already installed
    if dest.exists() {
        return Ok(());
    }

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    // Resolve the resource path — on Android this returns asset://localhost/...
    let resource_path = app
        .path()
        .resolve(
            format!("resources/{}", resource_name),
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| format!("Failed to resolve resource path: {e}"))?;

    // Use the FS plugin to read the resource. On Android, this routes through
    // the Kotlin AssetManager to read from the APK. On desktop/iOS, it uses std::fs.
    let bytes = match app.fs().read(&resource_path) {
        Ok(b) => b,
        Err(_) => {
            // Dev mode fallback: read from src-tauri/resources/ directly
            let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("resources")
                .join(&resource_name);
            std::fs::read(&dev_path).map_err(|e| {
                format!(
                    "Bundled resource not found: {} (tried {:?} and {:?}): {e}",
                    resource_name, resource_path, dev_path
                )
            })?
        }
    };

    std::fs::write(&dest, &bytes).map_err(|e| format!("Failed to write bundled module: {e}"))?;

    Ok(())
}
