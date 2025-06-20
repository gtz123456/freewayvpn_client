// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use std::net::TcpStream;
use std::time::Duration;
use std::{fs, io::Write};
use serde_json::Value;

use sysproxy::Sysproxy;
use std::sync::Mutex;
use tauri::{path::BaseDirectory, Manager, RunEvent};

use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    cleanup();
    tauri::Builder::default()
        .manage(Mutex::new(ChildProcessState::default()))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![launch_xray, close_xray, check_ipv6, ping])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app_handle: &tauri::AppHandle, event: RunEvent| {
          match &event {
            RunEvent::ExitRequested { api, code, .. } => {
              // Keep the event loop running even if all windows are closed
              // This allow us to catch tray icon events when there is no window
              // if we manually requested an exit (code is Some(_)) we will let it go through
              if code.is_none() {
                api.prevent_exit();
              }
            }
            RunEvent::WindowEvent {
              event: tauri::WindowEvent::CloseRequested { api, .. },
              label,
              ..
            } => {
              println!("closing window...");
              // run the window destroy manually just for fun :)
              // usually you'd show a dialog here to ask for confirmation or whatever
              api.prevent_close();
              app_handle
                .get_webview_window(label)
                .unwrap()
                .destroy()
                .unwrap();
            }
            _ => (),
          }
        });
}

#[cfg(target_family = "windows")]
mod windows_kill {
    use netstat::{get_sockets_info, ProtocolFlags};
    use netstat::AddressFamilyFlags;
    use std::process::Command;

    pub fn kill_ports() {
        let sockets = get_sockets_info(
            AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6,
            ProtocolFlags::TCP,
        ).expect("error getting sockets info");

        for socket in sockets {
            let local_port = match &socket.protocol_socket_info {
                netstat::ProtocolSocketInfo::Tcp(tcp_info) => tcp_info.local_port,
                netstat::ProtocolSocketInfo::Udp(udp_info) => udp_info.local_port,
            };

            if local_port == 1080 || local_port == 1081 {
                if let Some(pid) = socket.associated_pids.get(0) {
                    Command::new("taskkill")
                        .arg("/F")
                        .arg("/PID")
                        .arg(pid.to_string())
                        .spawn()
                        .expect("Failed to kill process");
                }
            }
        }
    }
}

fn cleanup() {
    let sysproxy = Sysproxy {
        enable: false,
        host: "localhost".into(),
        port: 1080,
        bypass: "localhost".into(),
    };

    sysproxy.set_system_proxy().expect("error disabling system proxy");

    // kill process that listens port 1080/1081 in case xray is not closed properly
    #[cfg(target_family = "windows")]
    windows_kill::kill_ports();

    
    #[cfg(target_family = "unix")]
    {
      // for unix systems, we can use `lsof` to find and kill processes
      let output = std::process::Command::new("lsof")
        .arg("-i")
        .arg(":1080")
        .output()
        .expect("Failed to execute lsof command");
      if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(1) { // skip header line
          let parts: Vec<&str> = line.split_whitespace().collect();
          if parts.len() > 1 {
            if let Ok(pid) = parts[1].parse::<u32>() {
              println!("Killing process with PID {} on port 1080", pid);
              std::process::Command::new("kill")
                .arg("-9")
                .arg(pid.to_string())
                .spawn()
                .expect("Failed to kill process");
            }
          }
        }
    }
    
  }
}

#[derive(Default)]
pub struct ChildProcessState {
  child: Mutex<String>
}

#[tauri::command]
async fn launch_xray(handle: tauri::AppHandle, uuid: String, pubkey: String, server: String, port: String) -> String {
    cleanup();
    let xray_json_path = handle.path().resolve("resources/xray.json", BaseDirectory::Resource).expect("error resolving xray.json path");

    println!("xray_json_path: {:?}", xray_json_path);

    let file = fs::File::open(&xray_json_path).expect("error opening file");

    let mut default_config: serde_json::Value = serde_json::from_reader(file).expect("error reading file");

    if let Some(vnext) = default_config["outbounds"][0]["settings"]["vnext"][0].as_object_mut() {
        vnext.insert("address".to_string(), Value::String(server));
        vnext.insert("port".to_string(), Value::Number(port.parse::<u64>().expect("error parsing port as u64").into()));
        if let Some(user) = vnext["users"][0].as_object_mut() {
            user.insert("id".to_string(), Value::String(uuid.to_string()));
        }
    }

    if let Some(reality_settings) = default_config["outbounds"][0]["streamSettings"]["realitySettings"].as_object_mut() {
        reality_settings.insert("publicKey".to_string(), Value::String(pubkey.to_string()));
    }

    let config_path = handle.path().resolve("resources/config.json", BaseDirectory::Resource).expect("error resolving config.json path");

    let mut file = fs::File::create(&config_path).expect("error creating file");

    println!("config_path: {:?}", config_path);

    file.write_all(
        serde_json::to_string_pretty(&default_config)
            .expect("error serializing to JSON")
            .as_bytes(),
    )
    .expect("error writing to file");

    let xray_path = handle.shell().sidecar("xray").unwrap();

    let resources_path = handle.path().resolve("resources", BaseDirectory::Resource).unwrap();
    let resources_dir = resources_path.to_str().unwrap();

    let (mut rx, child) = xray_path.env("XRAY_LOCATION_ASSET", resources_dir)
        .env("XRAY_LOCATION_CONFIG", resources_dir)
        .spawn()
        .expect("Failed to spawn xray process");

    let state = handle.state::<Mutex<ChildProcessState>>();
    let mut state = state.lock().unwrap();

    state.child = child.pid().to_string().into();

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                  let line_str = String::from_utf8_lossy(&line).to_string();
                  println!("[xray stdout] {}", line_str);
                }
                CommandEvent::Stderr(line) => {
                  let line_str = String::from_utf8_lossy(&line).to_string();
                  eprintln!("[xray stderr] {}", line_str);
                }
                CommandEvent::Error(line) => {
                    eprintln!("[xray error] {}", line);
                }
                CommandEvent::Terminated(code) => {
                    println!("[xray exited] code: {:?}", code);
                }
                _ => {}
            }
        }
    });

    let sysproxy = Sysproxy {
        enable: true,
        host: "127.0.0.1".into(),
        port: 1080,
        bypass: "localhost,127.0.0.1/8".into(),
    };

    sysproxy.set_system_proxy().expect("error setting system proxy");

    let pid = child.pid().to_string();

    pid
}

#[tauri::command]
fn close_xray(handle: tauri::AppHandle, pid: String) {
    let pid = pid.parse::<u32>().expect("error parsing PID");
    println!("Killing xray process with PID: {}", pid);

    #[cfg(target_family = "unix")]
    {
      handle.shell()
        .command("kill")
        .args(&["-9", &pid.to_string()])
        .spawn()
        .expect("Failed to kill xray process");
    }

    #[cfg(target_family = "windows")]
    {
      handle.shell()
        .command("taskkill")
        .args(&["/F", "/PID", &pid.to_string()])
        .spawn()
        .expect("Failed to kill xray process");
    }

    cleanup();
}

#[tauri::command]
fn check_ipv6() -> bool {
    let addr = "[2001:4860:4860::8888]:53"; // Google IPv6 DNS
    TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_secs(2)).is_ok()
}

#[tauri::command] // return latency in ms as string
async fn ping(handle: tauri::AppHandle, address: String) -> String {
    let shell = handle.shell();

    #[cfg(target_os = "windows")]
    let args = vec!["-n", "4", &address];
    #[cfg(not(target_os = "windows"))]
    let args = vec!["-c", "4", &address];

    println!("Pinging {} with args {:?}", address, args);

    let output = shell
        .command("ping")
        .args(&args)
        .output()
        .await
        .expect("failed to execute process");

    let stdout = String::from_utf8_lossy(&output.stdout);

    #[cfg(target_os = "windows")]
    {
        // Windows: look for "Average = XXms"
        for line in stdout.lines() {
            if line.contains("Average =") {
                if let Some(avg_part) = line.split("Average =").nth(1) {
                    let avg = avg_part.trim().replace("ms", "").replace(" ", "");
                    return avg;
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Unix: look for "rtt min/avg/max/mdev = ..."
        for line in stdout.lines() {
            if line.contains("avg") && line.contains('/') {
                let parts: Vec<&str> = line.split('=').collect();
                if parts.len() == 2 {
                    let values: Vec<&str> = parts[1].split('/').collect();
                    if values.len() >= 2 {
                        return values[1].trim().to_string();
                    }
                }
            }
        }
    }

    // If we reach here, either parsing failed or ping failed
    println!("Status: {:?}", output.status);
    let stderr = String::from_utf8_lossy(&output.stderr);
    eprintln!("ping failed: {}", stderr);
    "error".to_string()
}