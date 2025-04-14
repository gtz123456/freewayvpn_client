// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use std::{fs, io::Write};
use serde_json::Value;

use sysproxy::Sysproxy;
use tauri::{path::BaseDirectory, Manager};

// Windows-only import for creation_flags
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    cleanup();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![launch_xray, close_xray])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn cleanup() {
    let sysproxy = Sysproxy {
        enable: false,
        host: "localhost".into(),
        port: 1080,
        bypass: "localhost".into(),
    };

    sysproxy.set_system_proxy().expect("LogRocket: error disabling system proxy");
}

#[tauri::command]
fn launch_xray(handle: tauri::AppHandle, uuid: String, pubkey: String, server: String) -> String {
    let xray_json_path = handle.path().resolve("resources/xray.json", BaseDirectory::Resource).expect("LogRocket: error resolving xray.json path");

    println!("xray_json_path: {:?}", xray_json_path);

    let file = fs::File::open(&xray_json_path).expect("LogRocket: error opening file");

    let mut default_config: serde_json::Value = serde_json::from_reader(file).expect("LogRocket: error reading file");

    if let Some(vnext) = default_config["outbounds"][0]["settings"]["vnext"][0].as_object_mut() {
        vnext.insert("address".to_string(), Value::String(server));
        if let Some(user) = vnext["users"][0].as_object_mut() {
            user.insert("id".to_string(), Value::String(uuid.to_string()));
        }
    }

    if let Some(reality_settings) = default_config["outbounds"][0]["streamSettings"]["realitySettings"].as_object_mut() {
        reality_settings.insert("publicKey".to_string(), Value::String(pubkey.to_string()));
    }

    let config_path = handle.path().resolve("resources/config.json", BaseDirectory::Resource).expect("LogRocket: error resolving config.json path");

    let mut file = fs::File::create(&config_path).expect("LogRocket: error creating file");

    file.write_all(
        serde_json::to_string_pretty(&default_config)
            .expect("LogRocket: error serializing to JSON")
            .as_bytes(),
    )
    .expect("LogRocket: error writing to file");

    let xray_path = if cfg!(target_os = "windows") {
        "./resources/xray.exe"
    } else if cfg!(target_os = "linux") {
        "./resources/xray-linux"
    } else if cfg!(target_os = "macos") {
        "./resources/xray-macos"
    } else if cfg!(target_os = "android") {
        "./resources/xray-android"
    } else {
        "./resources/xray-ios"
    };

    let xray = {
        let mut cmd = std::process::Command::new(xray_path);

        #[cfg(target_os = "windows")]
        {
            // Hide terminal window
            cmd.creation_flags(0x08000000);
        }

        cmd.spawn().expect("LogRocket: error launching xray")
    };

    let sysproxy = Sysproxy {
        enable: true,
        host: "127.0.0.1".into(),
        port: 1080,
        bypass: "localhost,127.0.0.1/8".into(),
    };

    sysproxy.set_system_proxy().expect("LogRocket: error setting system proxy");

    xray.id().to_string()
}

#[tauri::command]
fn close_xray(pid: String) {
    let pid = pid.parse::<u32>().expect("LogRocket: error parsing PID");
    println!("Killing xray process with PID: {}", pid);

    #[cfg(target_family = "unix")]
    {
        std::process::Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .spawn()
            .expect("Failed to kill xray process");
    }

    #[cfg(target_family = "windows")]
    {
        std::process::Command::new("taskkill")
            .arg("/F")
            .arg("/PID")
            .arg(pid.to_string())
            .spawn()
            .expect("Failed to kill xray process");
    }

    let sysproxy = Sysproxy {
        enable: false,
        host: "127.0.0.1".into(),
        port: 1080,
        bypass: "localhost,127.0.0.1/8".into(),
    };

    sysproxy.set_system_proxy().expect("LogRocket: error disabling system proxy");
}
