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

/// Copy a bundled resource file to `dest_path`, installing or self-healing as needed.
///
/// `resource_name` is the filename relative to the resources directory (e.g. "sword-NASB.zip").
///
/// Behavior:
/// - If `dest` doesn't exist → install.
/// - If `dest` exists AND its size matches the bundled source → skip (cached).
/// - If `dest` exists but size differs → re-install (self-heals corrupt / stale copies,
///   e.g. Android 1.6.1 shipped SWORD zips wrapped in .jar containers by AGP).
#[tauri::command]
pub async fn install_bundled_module(
    app: tauri::AppHandle,
    resource_name: String,
    dest_path: String,
) -> Result<(), String> {
    let dest = PathBuf::from(&dest_path);

    let resource_path = app
        .path()
        .resolve(
            format!("resources/{}", resource_name),
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| format!("Failed to resolve resource path for {resource_name}: {e}"))?;

    println!(
        "[install_bundled_module] {} → {} (resource_path={:?})",
        resource_name, dest_path, resource_path
    );

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    // On Android, resources live inside the APK and require the FS plugin
    // (routes through Kotlin AssetManager). On desktop/iOS, use direct fs::copy
    // to avoid buffering the entire file in memory.
    #[cfg(target_os = "android")]
    {
        let bytes = app.fs().read(&resource_path).map_err(|e| {
            format!("Failed to read bundled resource {resource_name} from {resource_path:?}: {e}")
        })?;
        println!(
            "[install_bundled_module] read {} bytes from {}",
            bytes.len(),
            resource_name
        );
        if bytes.is_empty() {
            return Err(format!(
                "Bundled resource {resource_name} is empty (0 bytes read from {resource_path:?})"
            ));
        }

        if let Ok(meta) = std::fs::metadata(&dest) {
            if meta.len() == bytes.len() as u64 {
                println!(
                    "[install_bundled_module] {} already installed ({} bytes), skipping",
                    resource_name,
                    meta.len()
                );
                return Ok(());
            }
            println!(
                "[install_bundled_module] {} size mismatch (on-disk={}, bundled={}), re-installing",
                resource_name,
                meta.len(),
                bytes.len()
            );
        }

        std::fs::write(&dest, &bytes)
            .map_err(|e| format!("Failed to write {resource_name} to {dest_path}: {e}"))?;
        let written = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
        if written != bytes.len() as u64 {
            return Err(format!(
                "Short write for {resource_name}: expected {} bytes, wrote {}",
                bytes.len(),
                written
            ));
        }
        println!(
            "[install_bundled_module] wrote {} bytes to {}",
            written, dest_path
        );
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
                    "Bundled resource not found: {resource_name} (tried {resource_path:?} and {dev_path:?})"
                ));
            }
            dev_path
        };

        let source_size = std::fs::metadata(&source)
            .map(|m| m.len())
            .map_err(|e| format!("Failed to stat bundled source {source:?}: {e}"))?;

        if let Ok(meta) = std::fs::metadata(&dest) {
            if meta.len() == source_size {
                println!(
                    "[install_bundled_module] {} already installed ({} bytes), skipping",
                    resource_name, source_size
                );
                return Ok(());
            }
            println!(
                "[install_bundled_module] {} size mismatch (on-disk={}, bundled={}), re-installing",
                resource_name,
                meta.len(),
                source_size
            );
        }

        std::fs::copy(&source, &dest).map_err(|e| {
            format!("Failed to copy {resource_name} from {source:?} to {dest_path}: {e}")
        })?;
        println!(
            "[install_bundled_module] copied {} bytes to {}",
            source_size, dest_path
        );
    }

    Ok(())
}
