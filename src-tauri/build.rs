use std::{env, fs, path::Path};

fn main() {
    // Google Play requires 16 KB page-size support (targetSdk 35+): every
    // LOAD segment of the shipped .so must be 16 KB-aligned. Which default
    // you get depends on the linker cargo happens to resolve (NDK clang
    // aligns, rust-lld does not), and that resolution has flipped between CI
    // runs. Pass the flag explicitly so no toolchain default can regress it.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    }

    // NASB download signing key. `signed_download.rs` reads it via
    // `option_env!("NASB_SIGNING_KEY")`. Desktop builds get it straight from the
    // process env, but Tauri's iOS "Build Rust Code" Xcode phase runs in Xcode's
    // own process context and does NOT inherit env vars set on the CI step
    // (tauri-apps/tauri#13856), so `option_env!` would bake in `None` on iOS.
    // To make it reliable everywhere, prefer the env, fall back to a file written
    // next to this build script by CI, then re-export it via rustc-env so the
    // crate compiles with the value on every platform. When neither is present
    // (forks, Flathub) the key stays unset and NASB downloads are disabled with a
    // clear message — the intended behavior.
    println!("cargo:rerun-if-env-changed=NASB_SIGNING_KEY");
    let key_file =
        Path::new(&env::var("CARGO_MANIFEST_DIR").unwrap_or_default()).join("nasb_signing_key.txt");
    println!("cargo:rerun-if-changed={}", key_file.display());

    let key = env::var("NASB_SIGNING_KEY")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            fs::read_to_string(&key_file)
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        });
    if let Some(key) = key {
        println!("cargo:rustc-env=NASB_SIGNING_KEY={key}");
    }

    tauri_build::build()
}
