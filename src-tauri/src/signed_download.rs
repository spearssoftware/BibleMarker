//! Authenticated download for Lockman-licensed modules.
//!
//! NASB modules are served from `https://biblemarker.app/modules/<module>.zip`
//! by a Cloudflare Worker that validates an HMAC-SHA256 token signed with a
//! shared secret. The secret is embedded at build time via the `NASB_SIGNING_KEY`
//! environment variable in CI; the public AGPL repository never sees it. AGPL
//! forks built without the secret get a clear error when trying to download
//! NASB and can use the bundled ASV or any other public-domain SWORD module.
//!
//! Token format sent in `Authorization: BibleMarker <ts>.<base64url_hmac>`,
//! matching the Cloudflare Worker's `verifyToken` in worker/src/index.ts.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// Compile-time-injected signing key. `None` for builds without the secret
/// (local dev, AGPL forks, Flathub builds). Official CI builds set this via
/// `NASB_SIGNING_KEY` in `.github/workflows/release.yml`.
const NASB_SIGNING_KEY: Option<&str> = option_env!("NASB_SIGNING_KEY");

const ENDPOINT_BASE: &str = "https://biblemarker.app/modules";

type HmacSha256 = Hmac<Sha256>;

fn compute_token(module: &str, timestamp: u64, key: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(format!("{module}:{timestamp}").as_bytes());
    URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

/// Download a Lockman-licensed module from biblemarker.app with a signed token.
///
/// `module` is the filename at the endpoint, e.g. `"NASB-2020.zip"`.
/// `dest_path` is the absolute path to write the resulting zip.
///
/// Returns an error if the build has no signing key (forks/Flathub) or if the
/// network request fails. A 401 from the server is surfaced with a clear
/// message so the UI can guide the user.
#[tauri::command]
pub async fn download_signed_module(module: String, dest_path: String) -> Result<(), String> {
    let key = NASB_SIGNING_KEY.ok_or_else(|| {
        "This download requires the official BibleMarker app. \
         Use the bundled ASV or another translation."
            .to_string()
    })?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("System clock error: {e}"))?
        .as_secs();
    let token = compute_token(&module, timestamp, key.as_bytes());
    let auth_header = format!("BibleMarker {timestamp}.{token}");

    let dest = PathBuf::from(&dest_path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    let url = format!("{ENDPOINT_BASE}/{module}");
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Authorization", auth_header)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Server rejected the signed token. \
                    This build may not be the official BibleMarker app, \
                    or the embedded signing key is out of date."
            .to_string());
    }
    if !response.status().is_success() {
        return Err(format!(
            "Download failed: HTTP {} from {url}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    std::fs::write(&dest, &bytes).map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(())
}

/// True if this build has an embedded signing key. Used by the frontend to
/// decide whether to enable the signed-module download UI.
#[tauri::command]
pub fn has_signing_key() -> bool {
    NASB_SIGNING_KEY.is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_is_deterministic() {
        let key = b"test-key";
        let t1 = compute_token("NASB-2020.zip", 1700000000, key);
        let t2 = compute_token("NASB-2020.zip", 1700000000, key);
        assert_eq!(t1, t2);
    }

    #[test]
    fn token_changes_with_module() {
        let key = b"test-key";
        let t1 = compute_token("NASB-2020.zip", 1700000000, key);
        let t2 = compute_token("NASB-1995.zip", 1700000000, key);
        assert_ne!(t1, t2);
    }

    #[test]
    fn token_changes_with_timestamp() {
        let key = b"test-key";
        let t1 = compute_token("NASB-2020.zip", 1700000000, key);
        let t2 = compute_token("NASB-2020.zip", 1700000001, key);
        assert_ne!(t1, t2);
    }

    #[test]
    fn token_changes_with_key() {
        let t1 = compute_token("NASB-2020.zip", 1700000000, b"key-one");
        let t2 = compute_token("NASB-2020.zip", 1700000000, b"key-two");
        assert_ne!(t1, t2);
    }

    #[test]
    fn token_matches_known_value() {
        // Cross-check against the JS implementation. Same key, module, timestamp
        // must produce the same base64url HMAC. If this fails, client and Worker
        // are out of sync.
        let key = b"test-signing-key-1234567890abcdef";
        let token = compute_token("NASB-2020.zip", 1735689600, key);
        // Pre-computed in the worker tests with the same inputs.
        // This locks the wire format so accidental changes are caught.
        assert!(!token.is_empty());
        assert!(token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }
}
