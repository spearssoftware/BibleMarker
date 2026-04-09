use std::path::PathBuf;
use tauri::Manager;
#[cfg(target_os = "android")]
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
/// If `force` is true, always overwrite even if the file exists.
#[tauri::command]
pub async fn install_bundled_module(
    app: tauri::AppHandle,
    resource_name: String,
    dest_path: String,
    force: Option<bool>,
) -> Result<(), String> {
    let dest = PathBuf::from(&dest_path);

    // Skip if already installed (unless force is set)
    if dest.exists() && !force.unwrap_or(false) {
        return Ok(());
    }

    // If force mode, check if file sizes match — skip the copy if identical
    if dest.exists() {
        if let Ok(dest_meta) = std::fs::metadata(&dest) {
            let source_path = app
                .path()
                .resolve(
                    format!("resources/{}", resource_name),
                    tauri::path::BaseDirectory::Resource,
                )
                .ok();
            if let Some(ref sp) = source_path {
                if let Ok(src_meta) = std::fs::metadata(sp) {
                    if dest_meta.len() == src_meta.len() {
                        return Ok(());
                    }
                }
            }
        }
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

    // On Android, resources live inside the APK and require the FS plugin
    // (routes through Kotlin AssetManager). On desktop/iOS, use direct fs::copy
    // to avoid buffering the entire file in memory.
    #[cfg(target_os = "android")]
    {
        let bytes = match app.fs().read(&resource_path) {
            Ok(b) => b,
            Err(e) => {
                return Err(format!(
                    "Failed to read bundled resource {}: {e}",
                    resource_name
                ));
            }
        };
        std::fs::write(&dest, &bytes)
            .map_err(|e| format!("Failed to write bundled module: {e}"))?;
    }

    #[cfg(not(target_os = "android"))]
    {
        let source = if resource_path.exists() {
            resource_path
        } else {
            // Dev mode fallback
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
    }

    Ok(())
}
