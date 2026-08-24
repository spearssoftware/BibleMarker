use std::io::Read;
use std::path::{Component, Path, PathBuf};
use tauri::Manager;
#[cfg(target_os = "android")]
use tauri_plugin_fs::FsExt;

/// Hosts `download_file` is permitted to fetch from. The webview only ever
/// passes CrossWire SWORD package URLs; treating this as an arbitrary fetcher
/// (e.g. via a compromised/XSS'd webview) is refused.
const ALLOWED_DOWNLOAD_HOSTS: &[&str] = &["crosswire.org"];

/// Allow only `https://` URLs whose host is in [`ALLOWED_DOWNLOAD_HOSTS`].
fn is_allowed_download_url(url: &str) -> bool {
    match reqwest::Url::parse(url) {
        Ok(u) => {
            u.scheme() == "https"
                && u.host_str()
                    .is_some_and(|h| ALLOWED_DOWNLOAD_HOSTS.contains(&h))
        }
        Err(_) => false,
    }
}

/// Require `dest` to sit inside `sword_dir` with no parent-directory traversal.
/// `dest` does not exist yet, so the containment check is purely lexical.
fn is_allowed_dest(dest: &Path, sword_dir: &Path) -> bool {
    if dest.components().any(|c| matches!(c, Component::ParentDir)) {
        return false;
    }
    dest.starts_with(sword_dir)
}

/// True if the file at `path` starts with the zip magic bytes (`PK`).
///
/// AGP can wrap assets in a `.jar` container, producing a valid zip that doesn't
/// contain the expected SWORD contents, so an installed module is re-checked
/// against the header. An unreadable file is reported as not-a-zip so the
/// caller reinstalls it.
fn has_zip_magic(path: &Path) -> bool {
    (|| -> Result<bool, std::io::Error> {
        let mut f = std::fs::File::open(path)?;
        let mut magic = [0u8; 4];
        f.read_exact(&mut magic)?;
        Ok(magic[0] == 0x50 && magic[1] == 0x4B)
    })()
    .unwrap_or(false)
}

/// Remove the `-wal`/`-shm` sidecars belonging to `dest`.
///
/// Replacing a SQLite file leaves its sidecars describing pages that no longer
/// exist. SQLite then reads the pair back as "file is not a database" (code 26).
/// Missing sidecars are the normal case, so failures are ignored.
fn remove_sqlite_sidecars(dest: &Path) {
    if let Some(name) = dest.file_name().and_then(|n| n.to_str()) {
        for suffix in crate::db_maintenance::SQLITE_SIDECAR_SUFFIXES {
            let _ = std::fs::remove_file(dest.with_file_name(format!("{name}{suffix}")));
        }
    }
}

/// Download a file from `url` and save it to `dest_path`.
/// Creates parent directories if needed.
#[tauri::command]
pub async fn download_file(
    app: tauri::AppHandle,
    url: String,
    dest_path: String,
) -> Result<(), String> {
    if !is_allowed_download_url(&url) {
        return Err(format!("Refusing to download from disallowed URL: {url}"));
    }

    let sword_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?
        .join("sword");

    let path = PathBuf::from(&dest_path);
    if !is_allowed_dest(&path, &sword_dir) {
        return Err(format!(
            "Refusing to write outside the modules directory: {dest_path}"
        ));
    }

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

/// The length a SQLite database declares for itself: page size (bytes 16–17,
/// big-endian; the value 1 encodes 65536) times page count (bytes 28–31).
/// `None` when the buffer does not start with the SQLite magic.
fn sqlite_declared_len(header: &[u8; 100]) -> Option<u64> {
    if &header[..16] != b"SQLite format 3\0" {
        return None;
    }
    let page_size = match u16::from_be_bytes([header[16], header[17]]) {
        1 => 65536u64,
        n => u64::from(n),
    };
    let page_count = u64::from(u32::from_be_bytes([
        header[28], header[29], header[30], header[31],
    ]));
    Some(page_size * page_count)
}

/// Confirm the file at `dest` is a structurally whole copy of the resource.
///
/// Zip resources must carry the `PK` magic (AGP has shipped jar-wrapped
/// assets before — see `has_zip_magic`) and end in an End of Central
/// Directory record: a truncated zip still *starts* with `PK`, but its tail
/// lands in file data instead of the EOCD. SQLite resources must carry the
/// SQLite magic and — when the header's change counter says the field is
/// current — be exactly as long as the header declares (page size × page
/// count). That catches a truncated or over-long copy that a faithful write
/// of a bad buffer cannot: on Android the asset is read through a raw file
/// descriptor handed over from Kotlin, so a short read there otherwise looks
/// like success. Anything else only has to be non-empty.
fn validate_installed_resource(resource_name: &str, dest: &Path) -> Result<(), String> {
    if resource_name.ends_with(".zip") {
        if !has_zip_magic(dest) {
            return Err(format!(
                "{resource_name} does not start with the zip magic bytes"
            ));
        }
        if !has_zip_eocd(dest)
            .map_err(|e| format!("Failed to read the tail of {}: {e}", dest.display()))?
        {
            return Err(format!(
                "{resource_name} has no End of Central Directory record — the copy is truncated"
            ));
        }
    } else if resource_name.ends_with(".db") {
        let actual = std::fs::metadata(dest)
            .map_err(|e| format!("Failed to stat {}: {e}", dest.display()))?
            .len();
        let mut header = [0u8; 100];
        let mut f = std::fs::File::open(dest)
            .map_err(|e| format!("Failed to open {}: {e}", dest.display()))?;
        f.read_exact(&mut header).map_err(|e| {
            format!("{resource_name} is too short for a SQLite header ({actual} bytes): {e}")
        })?;
        let declared = sqlite_declared_len(&header)
            .ok_or_else(|| format!("{resource_name} does not start with the SQLite magic"))?;
        // The in-header size is only authoritative when the change counter
        // (bytes 24–27) matches the version-valid-for number (bytes 92–95);
        // a legacy writer can leave it stale. Skipping the length check then
        // beats rejecting a healthy database on every launch.
        let header_size_valid = header[24..28] == header[92..96] && declared > 0;
        if header_size_valid && declared != actual {
            return Err(format!(
                "{resource_name} header declares {declared} bytes but the file is {actual} bytes"
            ));
        }
    } else {
        let actual = std::fs::metadata(dest)
            .map_err(|e| format!("Failed to stat {}: {e}", dest.display()))?
            .len();
        if actual == 0 {
            return Err(format!("{resource_name} is empty"));
        }
    }

    Ok(())
}

/// True if an End of Central Directory signature appears in the file's final
/// KiB. Exact for our bundled zips (no archive comment, so the EOCD is the
/// last 22 bytes); a spec-complete scan would cover the 64 KiB maximum
/// comment, but this is a truncation check, not an adversarial-zip parser.
fn has_zip_eocd(path: &Path) -> Result<bool, std::io::Error> {
    use std::io::{Seek, SeekFrom};
    let mut f = std::fs::File::open(path)?;
    let len = f.metadata()?.len();
    let window = len.min(1024);
    f.seek(SeekFrom::End(-(window as i64)))?;
    let mut tail = vec![0u8; window as usize];
    f.read_exact(&mut tail)?;
    Ok(tail.windows(4).any(|w| w == [0x50, 0x4B, 0x05, 0x06]))
}

/// Sibling path a fresh copy is staged at before it replaces `dest`, so an
/// interrupted or invalid copy can never destroy a still-working install.
fn staging_path(dest: &Path) -> PathBuf {
    let mut name = dest
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    name.push(".part");
    dest.with_file_name(name)
}

/// Stream the bundled resource out of the APK into `dest`, returning the
/// byte count.
///
/// Android resources live inside the APK: the FS plugin routes through
/// Kotlin's AssetManager and hands back a raw file descriptor, so this is
/// the one platform that cannot use `std::fs::copy`. The open itself is a
/// synchronous JNI round-trip, so the whole job — open, copy, fsync — runs
/// on the blocking pool. The fsync matters: Android is prone to killing
/// backgrounded apps with writes still buffered.
#[cfg(target_os = "android")]
async fn copy_bundled_resource(
    app: &tauri::AppHandle,
    resource_name: &str,
    resource_path: &Path,
    dest: &Path,
) -> Result<u64, String> {
    let app = app.clone();
    let resource_path = resource_path.to_path_buf();
    let dest = dest.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || -> std::io::Result<u64> {
        let mut opts = tauri_plugin_fs::OpenOptions::default();
        opts.read(true);
        let mut source = app.fs().open(resource_path, opts)?;
        let mut out = std::fs::File::create(&dest)?;
        let n = std::io::copy(&mut source, &mut out)?;
        out.sync_all()?;
        Ok(n)
    })
    .await
    .map_err(|e| format!("Install task for {resource_name} panicked: {e}"))?
    .map_err(|e| format!("Failed to install {resource_name}: {e}"))
}

/// Copy the bundled resource into `dest`, returning the byte count.
///
/// The resource dir is a real directory here (with a dev-mode fallback into
/// the crate's own `resources/`), so `std::fs::copy` keeps the platform fast
/// path — on macOS/iOS that is an APFS copy-on-write clone, which moves no
/// data at all.
#[cfg(not(target_os = "android"))]
async fn copy_bundled_resource(
    _app: &tauri::AppHandle,
    resource_name: &str,
    resource_path: &Path,
    dest: &Path,
) -> Result<u64, String> {
    let source = if resource_path.exists() {
        resource_path.to_path_buf()
    } else {
        // Dev mode fallback
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(resource_name);
        if !dev_path.exists() {
            return Err(format!(
                "Bundled resource not found: {resource_name} (tried {resource_path:?} and {dev_path:?})"
            ));
        }
        dev_path
    };

    let source_for_err = source.clone();
    let (source, dest) = (source, dest.to_path_buf());
    tauri::async_runtime::spawn_blocking(move || std::fs::copy(&source, &dest))
        .await
        .map_err(|e| format!("Install task for {resource_name} panicked: {e}"))?
        .map_err(|e| format!("Failed to copy {resource_name} from {source_for_err:?}: {e}"))
}

/// Copy a bundled resource file to `dest_path`, installing or self-healing as needed.
///
/// A marker file (`<dest>.installed`) records the app version that last
/// installed the resource. Bundled resources only change when the app itself
/// updates, so the copy is skipped when the marker matches the running version
/// AND the file still passes [`validate_installed_resource`]. Anything else —
/// first run, app update, damaged or truncated file — streams a fresh copy and
/// validates it before the marker is written, so a bad install can never be
/// recorded as done.
///
/// Caveat: a build that changes a resource without changing the app version —
/// dev iteration, or a manually dispatched TestFlight build from a moving
/// branch — keeps the previously installed copy, since the marker can't tell
/// the two apart. Bump the version, or delete the installed file or its
/// marker, to force a refresh.
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

    let app_version = app.package_info().version.to_string();

    println!(
        "[install_bundled_module] {} → {} (resource_path={:?}, app v{})",
        resource_name, dest_path, resource_path, app_version
    );

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    let marker = crate::db_maintenance::marker_path(&dest);
    if std::fs::read_to_string(&marker).is_ok_and(|v| v.trim() == app_version) {
        match validate_installed_resource(&resource_name, &dest) {
            Ok(()) => {
                // Validation only reads the main file. A stale -wal/-shm pair
                // beside an intact DB would still read back as "file is not a
                // database", so clear them here exactly as the reinstall path
                // does. No connection is open yet: installs always run before
                // Database.load, and sqlx never puts this read-only DB in WAL
                // mode, so legitimate sidecars don't exist.
                remove_sqlite_sidecars(&dest);
                println!(
                    "[install_bundled_module] {} already installed by v{} and intact, skipping",
                    resource_name, app_version
                );
                return Ok(());
            }
            Err(e) => println!(
                "[install_bundled_module] {} marker matches but the file is unusable ({e}), re-installing",
                resource_name
            ),
        }
    }

    // A half-finished install must never look done: drop the marker before
    // touching the file, and only write it back after validation passes.
    let _ = std::fs::remove_file(&marker);
    remove_sqlite_sidecars(&dest);

    // Stage the copy next to `dest` and rename only after validation passes:
    // an interrupted or corrupt copy must never destroy a still-working
    // install, and the rename is atomic within the directory.
    let staged = staging_path(&dest);
    let copied = copy_bundled_resource(&app, &resource_name, &resource_path, &staged).await?;

    if let Err(e) = validate_installed_resource(&resource_name, &staged) {
        let _ = std::fs::remove_file(&staged);
        return Err(format!(
            "{resource_name} failed validation after copying {copied} bytes: {e}"
        ));
    }

    std::fs::rename(&staged, &dest)
        .map_err(|e| format!("Failed to move {resource_name} into place: {e}"))?;

    std::fs::write(&marker, &app_version)
        .map_err(|e| format!("Failed to record install marker for {resource_name}: {e}"))?;
    println!(
        "[install_bundled_module] installed {} ({} bytes) for v{}",
        resource_name, copied, app_version
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_crosswire_https() {
        assert!(is_allowed_download_url(
            "https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/KJV.zip"
        ));
    }

    #[test]
    fn rejects_non_https_and_other_hosts() {
        assert!(!is_allowed_download_url(
            "http://crosswire.org/pub/sword/KJV.zip"
        ));
        assert!(!is_allowed_download_url(
            "https://evil.example.com/payload.zip"
        ));
        assert!(!is_allowed_download_url(
            "https://crosswire.org.evil.com/KJV.zip"
        ));
        assert!(!is_allowed_download_url("file:///etc/passwd"));
        assert!(!is_allowed_download_url("not a url"));
    }

    #[test]
    fn allows_dest_inside_sword_dir() {
        let sword = Path::new("/home/u/.local/share/app.biblemarker/sword");
        assert!(is_allowed_dest(&sword.join("KJV.zip"), sword));
    }

    #[test]
    fn sqlite_declared_len_reads_the_header() {
        let mut header = [0u8; 100];
        header[..16].copy_from_slice(b"SQLite format 3\0");
        header[16] = 0x10; // page_size 4096
        header[17] = 0x00;
        header[31] = 3; // page_count 3
        assert_eq!(sqlite_declared_len(&header), Some(4096 * 3));

        // A page size field of 1 encodes 65536.
        header[16] = 0x00;
        header[17] = 0x01;
        assert_eq!(sqlite_declared_len(&header), Some(65536 * 3));

        header[0] = b'X';
        assert_eq!(sqlite_declared_len(&header), None);
    }

    #[test]
    fn validates_a_whole_database_and_rejects_truncation() {
        let dir = std::env::temp_dir().join(format!("biblemarker-validate-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("gnosis-lite.db");

        // Two 4096-byte pages, exactly as the header declares.
        let mut contents = vec![0u8; 8192];
        contents[..16].copy_from_slice(b"SQLite format 3\0");
        contents[16] = 0x10;
        contents[31] = 2;
        std::fs::write(&db, &contents).unwrap();
        assert!(validate_installed_resource("gnosis-lite.db", &db).is_ok());

        // A truncated copy must be rejected, and the message must say why.
        std::fs::write(&db, &contents[..5000]).unwrap();
        let err = validate_installed_resource("gnosis-lite.db", &db).unwrap_err();
        assert!(
            err.contains("declares 8192 bytes but the file is 5000"),
            "{err}"
        );

        // Garbage is not a database.
        std::fs::write(&db, vec![0xAAu8; 8192]).unwrap();
        assert!(validate_installed_resource("gnosis-lite.db", &db)
            .unwrap_err()
            .contains("SQLite magic"));

        // A stale in-header size (change counter != version-valid-for) must
        // not reject the file: the length field is untrustworthy then.
        let mut stale = contents.clone();
        stale[24] = 9;
        std::fs::write(&db, &stale[..5000]).unwrap();
        assert!(validate_installed_resource("gnosis-lite.db", &db).is_ok());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn zip_validation_requires_the_end_of_central_directory() {
        let dir = std::env::temp_dir().join(format!("biblemarker-zip-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let zip = dir.join("sword-TEST.zip");

        let mut whole = b"PK\x03\x04".to_vec();
        whole.extend(vec![0u8; 500]);
        whole.extend(b"PK\x05\x06");
        whole.extend([0u8; 18]);
        std::fs::write(&zip, &whole).unwrap();
        assert!(validate_installed_resource("sword-TEST.zip", &zip).is_ok());

        // Truncation keeps the leading magic but loses the EOCD.
        std::fs::write(&zip, &whole[..200]).unwrap();
        let err = validate_installed_resource("sword-TEST.zip", &zip).unwrap_err();
        assert!(err.contains("truncated"), "{err}");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn staging_path_sits_next_to_the_file() {
        assert_eq!(
            staging_path(Path::new("/data/gnosis-lite.db")),
            Path::new("/data/gnosis-lite.db.part")
        );
    }

    #[test]
    fn removes_sidecars_but_keeps_the_database() {
        let dir =
            std::env::temp_dir().join(format!("biblemarker-sidecar-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("gnosis-lite.db");
        std::fs::write(&db, b"db").unwrap();
        std::fs::write(dir.join("gnosis-lite.db-wal"), b"wal").unwrap();
        std::fs::write(dir.join("gnosis-lite.db-shm"), b"shm").unwrap();

        remove_sqlite_sidecars(&db);

        assert!(db.exists(), "the database itself must survive");
        assert!(!dir.join("gnosis-lite.db-wal").exists());
        assert!(!dir.join("gnosis-lite.db-shm").exists());

        // Absent sidecars are the normal case and must not panic.
        remove_sqlite_sidecars(&db);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rejects_dest_outside_or_traversing() {
        let sword = Path::new("/home/u/.local/share/app.biblemarker/sword");
        assert!(!is_allowed_dest(
            Path::new("/home/u/.ssh/authorized_keys"),
            sword
        ));
        assert!(!is_allowed_dest(
            Path::new("/home/u/.local/share/app.biblemarker/sword/../../evil.zip"),
            sword
        ));
    }
}
