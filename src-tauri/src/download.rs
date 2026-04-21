use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::Manager;
#[cfg(target_os = "android")]
use tauri_plugin_fs::FsExt;

const HASH_BUFFER_SIZE: usize = 64 * 1024;

/// Stream-hash a file on disk with SHA-256. Returns hex digest.
fn hash_file(path: &Path) -> Result<String, std::io::Error> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; HASH_BUFFER_SIZE];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Hash an in-memory byte slice with SHA-256. Returns hex digest.
/// Only used on Android, where bundled resources are read from the APK into memory.
#[cfg(target_os = "android")]
fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

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
/// - If size differs → re-install (fast path).
/// - If size matches → compare SHA-256 hashes. Equal → skip. Different → re-install.
///
/// The hash check catches content drift between builds that happen to produce the same
/// file size (e.g. two gnosis-lite.db builds with identical byte counts but different
/// data). Hashing ~40MB on modern hardware is <200ms — only paid when sizes match.
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

        // Log first 4 bytes (expect PK\x03\x04 for zip) to aid diagnosis
        let magic: Vec<u8> = bytes.iter().take(4).copied().collect();
        println!(
            "[install_bundled_module] {} magic bytes: {:02X?}",
            resource_name, magic
        );

        if let Ok(meta) = std::fs::metadata(&dest) {
            // Also check that the on-disk file starts with a zip magic header.
            // AGP can wrap assets in a .jar container, producing a valid zip that
            // doesn't contain the expected SWORD contents. In that case, overwrite.
            let on_disk_ok = (|| -> Result<bool, std::io::Error> {
                let mut f = std::fs::File::open(&dest)?;
                let mut magic = [0u8; 4];
                f.read_exact(&mut magic)?;
                Ok(magic[0] == 0x50 && magic[1] == 0x4B)
            })()
            .unwrap_or(false);

            if meta.len() == bytes.len() as u64 && on_disk_ok {
                let bundled_hash = hash_bytes(&bytes);
                let dest_hash = hash_file(&dest).ok();
                if dest_hash.as_deref() == Some(bundled_hash.as_str()) {
                    println!(
                        "[install_bundled_module] {} already installed ({} bytes, hash match), skipping",
                        resource_name,
                        meta.len()
                    );
                    return Ok(());
                }
                println!(
                    "[install_bundled_module] {} size matches ({} bytes) but hash differs (on-disk={:?}, bundled={}), re-installing",
                    resource_name,
                    meta.len(),
                    dest_hash,
                    bundled_hash
                );
            } else {
                println!(
                    "[install_bundled_module] {} size mismatch (on-disk={}, bundled={}), re-installing",
                    resource_name,
                    meta.len(),
                    bytes.len()
                );
            }
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
                // Size matches — confirm with SHA-256 before trusting the cache.
                let source_hash = hash_file(&source).ok();
                let dest_hash = hash_file(&dest).ok();
                if source_hash.is_some() && source_hash == dest_hash {
                    println!(
                        "[install_bundled_module] {} already installed ({} bytes, hash match), skipping",
                        resource_name, source_size
                    );
                    return Ok(());
                }
                println!(
                    "[install_bundled_module] {} size matches ({} bytes) but hash differs (on-disk={:?}, bundled={:?}), re-installing",
                    resource_name, source_size, dest_hash, source_hash
                );
            } else {
                println!(
                    "[install_bundled_module] {} size mismatch (on-disk={}, bundled={}), re-installing",
                    resource_name,
                    meta.len(),
                    source_size
                );
            }
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
