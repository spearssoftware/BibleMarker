use std::path::PathBuf;
use tauri::Manager;

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

    // Try the production resource path first
    let resource_path = app
        .path()
        .resolve(&resource_name, tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve resource path: {e}"))?;

    let source = if resource_path.exists() {
        resource_path
    } else {
        // Dev mode fallback: read from src-tauri/resources/
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(&resource_name);
        if !dev_path.exists() {
            return Err(format!(
                "Bundled resource not found: {} (tried {:?} and {:?})",
                resource_name, resource_path, dev_path
            ));
        }
        dev_path
    };

    std::fs::copy(&source, &dest).map_err(|e| format!("Failed to copy bundled module: {e}"))?;

    Ok(())
}
