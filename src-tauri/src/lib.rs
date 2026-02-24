#[cfg(desktop)]
mod desktop;

#[cfg(mobile)]
mod mobile;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    desktop::run();

    #[cfg(mobile)]
    mobile::run();
}