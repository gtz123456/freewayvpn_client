// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use std::os::windows::process::CommandExt;
use std::{fs, io::Write};
use serde_json::Value;

use sysproxy::Sysproxy;

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
  // disable system proxy
  let sysproxy = Sysproxy {
    enable: false,
    host: "localhost".into(),
    port: 1080,
    bypass: "localhost".into(),
  };

  sysproxy.set_system_proxy().expect("LogRocket: error disabling system proxy");
}

#[tauri::command]
fn launch_xray(uuid: String, pubkey: String, server: String) -> String {
  // write uuid to config file
  let mut default_config = {  
    let file_content = fs::read_to_string("./bin/xray.json").expect("LogRocket: error reading file");
    serde_json::from_str::<Value>(&file_content).expect("LogRocket: error serializing to JSON")
  };

  // set server address
  if let Some(vnext) = default_config["outbounds"][0]["settings"]["vnext"][0].as_object_mut() {
    vnext.insert("address".to_string(), Value::String(server));
  }
  
  // set uuid
  if let Some(vnext) = default_config["outbounds"][0]["settings"]["vnext"][0].as_object_mut() {
    if let Some(user) = vnext["users"][0].as_object_mut() {
        user.insert("id".to_string(), Value::String(uuid.to_string()));
    }
  }

  // set pubkey
  if let Some(reality_settings) = default_config["outbounds"][0]["streamSettings"]["realitySettings"].as_object_mut() {
    reality_settings.insert("publicKey".to_string(), Value::String(pubkey.to_string()));

}
  
  let mut file = fs::File::create("./bin/config.json").expect("LogRocket: error creating file");
  file.write_all(serde_json::to_string_pretty(&default_config).expect("LogRocket: error serializing to JSON").as_bytes()).expect("LogRocket: error writing to file");

  let xray_path = if cfg!(target_os = "windows") {
    "./bin/xray.exe"
  } else if cfg!(target_os = "linux") {
    "./bin/xray-linux"
  } else if cfg!(target_os = "macos") {
    "./bin/xray-macos"
  } else if cfg!(target_os = "android") {
    "./bin/xray-android"
  } else {
    "./bin/xray-ios"
  };
  let xray = std::process::Command::new(xray_path).creation_flags(0x08000000).spawn().expect("LogRocket: error launching xray"); // CREATE_NO_WINDOW flag

  // set system proxy at port 1080
  let sysproxy = Sysproxy {
    enable: true,
    host: "127.0.0.1".into(),
    port: 1080,
    bypass: "localhost,127.0.0.1/8".into(),
  };

  sysproxy.set_system_proxy().expect("LogRocket: error setting system proxy");

  // return the PID of the xray process
  xray.id().to_string()

}

#[tauri::command]
fn close_xray(pid: String) {
  let pid = pid.parse::<u32>().expect("LogRocket: error parsing PID");

  // print the PID of the xray process
  println!("Killing xray process with PID: {}", pid);
  
  #[cfg(target_family = "unix")]
  {
      // On Unix systems (Linux, macOS), you can use `Command::new("kill")` to terminate the process.
      std::process::Command::new("kill")
          .arg("-9") // Optionally use SIGKILL to forcefully kill the process
          .arg(pid.to_string())
          .spawn()
          .expect("Failed to kill xray process");
  }

  #[cfg(target_family = "windows")]
  {
      // On Windows, use `taskkill` to terminate the process by PID.
      std::process::Command::new("taskkill")
          .arg("/F") // Forcefully terminate the process
          .arg("/PID")
          .arg(pid.to_string())
          .spawn()
          .expect("Failed to kill xray process");
  }

  // disable system proxy
  let sysproxy = Sysproxy {
    enable: false,
    host: "127.0.0.1".into(),
    port: 1080,
    bypass: "localhost,127.0.0.1/8".into(),
  };

  sysproxy.set_system_proxy().expect("LogRocket: error disabling system proxy");
}