use tauri::App;

#[cfg(mobile)]
mod mobile;
#[cfg(mobile)]
pub use mobile::*;

// iCloud integration for macOS/iOS
mod icloud;

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
            builder = builder
                .plugin(tauri_plugin_updater::Builder::new().build())
                .plugin(tauri_plugin_process::init());
        }

        builder
            .invoke_handler(tauri::generate_handler![
                icloud::check_icloud_status,
                icloud::get_sync_folder_path,
                icloud::write_sync_file,
                icloud::list_sync_dir,
                icloud::test_icloud_write,
                icloud::delete_local_database,
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
