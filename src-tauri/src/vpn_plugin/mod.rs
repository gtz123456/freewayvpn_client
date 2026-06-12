use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(target_os = "android")]
pub mod mobile;

#[cfg(target_os = "android")]
pub use mobile::VpnMobile;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("vpn")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    api.register_android_plugin("com.freewayvpnclient.app", "VpnPlugin")?;
                app.manage(VpnMobile(handle));
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                let _ = app;
            }
            Ok(())
        })
        .build()
}
