//! Sync-server client: email-OTP auth + secure session-token storage.
//!
//! All HTTP to the sync server runs here in Rust (reqwest) rather than the
//! webview, for two reasons:
//!   1. No webview CORS to fight across five platforms.
//!   2. The opaque session token never enters the webview. `auth_verify` stores
//!      it in an app-private file and returns only the `accountId`; later sync
//!      calls (Phase 3) read the token here and attach it as a Bearer header.
//!
//! Token storage is an app-private file (`sync_session.json` in the app data
//! dir, mode 0600 on Unix). It is NOT in the synced/exported SQLite database, so
//! it never replicates to the server or other devices. This is the MVP; OS
//! keychain hardening is a later phase.
//!
//! Errors are structured (`{ kind, statusCode, message }`) so the TS layer can
//! branch: 401 → re-auth, 0/5xx → retry, other 4xx → fatal. See `offline.ts`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

const SYNC_BASE: &str = "https://biblemarker.app";
const SESSION_FILE: &str = "sync_session.json";

// ============================================================================
// Structured error
// ============================================================================

/// Serializes to `{ kind, statusCode, message }` for the TS error classifier.
/// `statusCode` is the HTTP status, `0` for network failures (which `offline.ts`
/// treats as retryable) and `1` for local/non-network errors (not retried).
#[derive(Debug, Serialize)]
pub struct SyncError {
    pub kind: String,
    #[serde(rename = "statusCode")]
    pub status_code: u16,
    pub message: String,
}

impl SyncError {
    fn new(kind: &str, status: u16, message: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            status_code: status,
            message: message.into(),
        }
    }
    fn network(e: reqwest::Error) -> Self {
        Self::new("network", 0, format!("network error: {e}"))
    }
    fn storage(message: impl Into<String>) -> Self {
        Self::new("storage", 1, message)
    }
    fn protocol(message: impl Into<String>) -> Self {
        Self::new("server", 1, message)
    }
    fn from_response(status: reqwest::StatusCode, body: &str) -> Self {
        let code = status.as_u16();
        let kind = match code {
            401 | 403 => "auth",
            429 => "rate_limit",
            400..=499 => "client",
            _ => "server",
        };
        let message = extract_error(body).unwrap_or_else(|| format!("HTTP {code}"));
        Self::new(kind, code, message)
    }
}

/// Pull the `error` field out of a `{ "error": "..." }` body, if present.
fn extract_error(body: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    value.get("error")?.as_str().map(|s| s.to_string())
}

// ============================================================================
// Token storage (app-private file, Rust-owned)
// ============================================================================

#[derive(Serialize, Deserialize)]
pub(crate) struct StoredSession {
    pub(crate) token: String,
    pub(crate) account_id: String,
}

fn session_path(app: &tauri::AppHandle) -> Result<PathBuf, SyncError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| SyncError::storage(format!("no app data dir: {e}")))?;
    Ok(dir.join(SESSION_FILE))
}

fn store_session(app: &tauri::AppHandle, token: &str, account_id: &str) -> Result<(), SyncError> {
    let path = session_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| SyncError::storage(format!("create dir: {e}")))?;
    }
    let json = serde_json::to_string(&StoredSession {
        token: token.to_string(),
        account_id: account_id.to_string(),
    })
    .map_err(|e| SyncError::storage(format!("serialize session: {e}")))?;
    write_private_file(&path, &json)
        .map_err(|e| SyncError::storage(format!("write session: {e}")))?;
    Ok(())
}

/// Write `data` to `path` with owner-only permissions. On Unix the mode is set
/// at `open` time so the file is never momentarily world-readable (no
/// write-then-chmod race). On Windows/Android the app data dir is already
/// user-private.
#[cfg(unix)]
fn write_private_file(path: &std::path::Path, data: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    file.write_all(data.as_bytes())
}

#[cfg(not(unix))]
fn write_private_file(path: &std::path::Path, data: &str) -> std::io::Result<()> {
    std::fs::write(path, data)
}

/// Read the stored session, or `None` if signed out / unreadable.
/// `pub(crate)` so the Phase-3 sync commands can attach the bearer token.
pub(crate) fn read_session(app: &tauri::AppHandle) -> Option<StoredSession> {
    let path = session_path(app).ok()?;
    let contents = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

fn delete_session(app: &tauri::AppHandle) {
    if let Ok(path) = session_path(app) {
        let _ = std::fs::remove_file(path); // ignore "not found"
    }
}

// ============================================================================
// Auth commands
// ============================================================================

/// Request a sign-in code be emailed to `email`. Always succeeds for a valid
/// email server-side (no account enumeration).
#[tauri::command]
pub async fn auth_request(email: String) -> Result<(), SyncError> {
    let res = post_json("/auth/request", &serde_json::json!({ "email": email })).await?;
    let status = res.status();
    if status.is_success() {
        return Ok(());
    }
    let body = res.text().await.unwrap_or_default();
    Err(SyncError::from_response(status, &body))
}

/// Result of a successful sign-in returned to the webview — note this does NOT
/// include the session token, which stays in Rust.
#[derive(Serialize)]
pub struct AuthSession {
    #[serde(rename = "accountId")]
    pub account_id: String,
}

#[derive(Deserialize)]
struct VerifyResponse {
    token: String,
    #[serde(rename = "accountId")]
    account_id: String,
}

/// Verify an emailed code. On success, stores the session token in Rust and
/// returns only the `accountId`.
#[tauri::command]
pub async fn auth_verify(
    app: tauri::AppHandle,
    email: String,
    code: String,
    device_id: Option<String>,
) -> Result<AuthSession, SyncError> {
    let mut body = serde_json::json!({ "email": email, "code": code });
    if let Some(d) = device_id {
        body["deviceId"] = serde_json::json!(d);
    }

    let res = post_json("/auth/verify", &body).await?;
    let status = res.status();
    let text = res.text().await.map_err(SyncError::network)?;
    if !status.is_success() {
        return Err(SyncError::from_response(status, &text));
    }

    let parsed: VerifyResponse = serde_json::from_str(&text)
        .map_err(|e| SyncError::protocol(format!("bad verify response: {e}")))?;
    store_session(&app, &parsed.token, &parsed.account_id)?;
    Ok(AuthSession {
        account_id: parsed.account_id,
    })
}

/// The signed-in account id, or `None` if signed out. Lets the webview reflect
/// auth state without ever seeing the token.
#[tauri::command]
pub fn get_session_account(app: tauri::AppHandle) -> Option<String> {
    read_session(&app).map(|s| s.account_id)
}

/// Sign out: best-effort server revoke, then drop the local token.
#[tauri::command]
pub async fn auth_revoke(app: tauri::AppHandle) -> Result<(), SyncError> {
    if let Some(session) = read_session(&app) {
        // Best-effort — even if the network call fails, we still clear locally.
        let _ = reqwest::Client::new()
            .post(format!("{SYNC_BASE}/auth/revoke"))
            .header("Authorization", format!("Bearer {}", session.token))
            .send()
            .await;
    }
    delete_session(&app);
    Ok(())
}

/// Drop the local token without contacting the server (e.g. after the server
/// reports the session is gone).
#[tauri::command]
pub fn clear_session_token(app: tauri::AppHandle) -> Result<(), SyncError> {
    delete_session(&app);
    Ok(())
}

// ============================================================================
// HTTP helper
// ============================================================================

async fn post_json(path: &str, body: &serde_json::Value) -> Result<reqwest::Response, SyncError> {
    reqwest::Client::new()
        .post(format!("{SYNC_BASE}{path}"))
        .header("Content-Type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(SyncError::network)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_error_reads_error_field() {
        assert_eq!(
            extract_error(r#"{"error":"nope"}"#),
            Some("nope".to_string())
        );
        assert_eq!(extract_error("not json"), None);
        assert_eq!(extract_error(r#"{"ok":true}"#), None);
    }

    #[test]
    fn from_response_classifies_status() {
        assert_eq!(
            SyncError::from_response(reqwest::StatusCode::UNAUTHORIZED, "").kind,
            "auth"
        );
        assert_eq!(
            SyncError::from_response(reqwest::StatusCode::TOO_MANY_REQUESTS, "").kind,
            "rate_limit"
        );
        assert_eq!(
            SyncError::from_response(reqwest::StatusCode::BAD_REQUEST, "").kind,
            "client"
        );
        assert_eq!(
            SyncError::from_response(reqwest::StatusCode::INTERNAL_SERVER_ERROR, "").kind,
            "server"
        );
    }

    #[test]
    fn network_error_is_status_zero() {
        // status 0 is what offline.ts treats as a retryable network failure.
        let s = SyncError::new("network", 0, "x");
        assert_eq!(s.status_code, 0);
    }
}
