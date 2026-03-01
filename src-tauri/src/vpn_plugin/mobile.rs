use serde::de::DeserializeOwned;
use tauri::{
    plugin::{mobile::PluginInvokeError, PluginHandle},
    Runtime,
};

pub struct VpnMobile<R: Runtime>(pub(crate) PluginHandle<R>);

impl<R: Runtime> VpnMobile<R> {
    fn run<T: DeserializeOwned>(
        &self,
        command: &str,
        payload: serde_json::Value,
    ) -> Result<T, PluginInvokeError> {
        self.0.run_mobile_plugin(command, payload)
    }

    /// Call the Kotlin `startVpn` command.
    pub fn start_vpn(
        &self,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, PluginInvokeError> {
        self.run("startVpn", payload)
    }

    /// Call the Kotlin `stopVpn` command.
    pub fn stop_vpn(&self) -> Result<serde_json::Value, PluginInvokeError> {
        self.run("stopVpn", serde_json::json!({}))
    }
}
