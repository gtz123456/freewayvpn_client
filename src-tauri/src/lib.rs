#[cfg(desktop)]
mod desktop;

mod util;

#[cfg(target_os = "ios")]
mod ios;

#[cfg(target_os = "android")]
mod vpn_plugin;

#[cfg(target_os = "android")]
mod android;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    desktop::run();

    #[cfg(target_os = "ios")]
    ios::run();

    #[cfg(target_os = "android")]
    android::run();
}
