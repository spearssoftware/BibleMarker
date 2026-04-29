use tauri::App;

#[cfg(mobile)]
mod mobile;
#[cfg(mobile)]
pub use mobile::*;

// iCloud integration for macOS/iOS
mod icloud;

// File download (bypasses webview CORS)
mod download;

// Flatpak sandbox detection (Linux only, but compiled everywhere — returns false off-Linux)
mod flatpak;

// Authenticated download for Lockman-licensed modules (NASB)
mod signed_download;

pub type SetupHook = Box<dyn FnOnce(&mut App) -> Result<(), Box<dyn std::error::Error>> + Send>;

#[derive(Default)]
pub struct AppBuilder {
    setup: Option<SetupHook>,
}

impl AppBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    #[must_use]
    pub fn setup<F>(mut self, setup: F) -> Self
    where
        F: FnOnce(&mut App) -> Result<(), Box<dyn std::error::Error>> + Send + 'static,
    {
        self.setup.replace(Box::new(setup));
        self
    }

    pub fn run(self) {
        let setup = self.setup;
        let mut builder = tauri::Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_sql::Builder::new().build())
            .plugin(tauri_plugin_opener::init());

        #[cfg(desktop)]
        {
            builder = builder.plugin(tauri_plugin_process::init());
            // Skip the in-app updater under Flatpak — Flathub manages updates.
            if !flatpak::is_flatpak() {
                builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
            }
        }

        builder
            .invoke_handler(tauri::generate_handler![
                icloud::check_icloud_status,
                icloud::get_sync_folder_path,
                icloud::write_sync_file,
                icloud::list_sync_dir,
                icloud::test_icloud_write,
                icloud::delete_local_database,
                download::download_file,
                download::install_bundled_module,
                flatpak::check_flatpak,
                signed_download::download_signed_module,
                signed_download::has_signing_key,
            ])
            .setup(move |app| {
                if let Some(setup) = setup {
                    (setup)(app)?;
                }
                Ok(())
            })
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}
