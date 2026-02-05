use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mobile")
        .build()
}

#[tauri::mobile_entry_point]
fn main() {
    super::AppBuilder::new().run()
}
