use std::path::Path;

const FLATPAK_INFO_PATH: &str = "/.flatpak-info";

pub fn is_flatpak() -> bool {
    Path::new(FLATPAK_INFO_PATH).exists()
}

#[tauri::command]
pub fn check_flatpak() -> bool {
    is_flatpak()
}
