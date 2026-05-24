// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use serde_json::Value;
use std::net::TcpStream;
use std::time::Duration;
use std::{fs, io::Write};

use sysproxy::Sysproxy;
// use std::sync::Mutex;
use tauri::{path::BaseDirectory, Manager, RunEvent};

use surge_ping::{Client, Config, PingIdentifier, PingSequence};

use std::io::{BufRead, BufReader};
use std::process::Command;
use std::process::Stdio;
use std::sync::mpsc;

pub fn run() {
    cleanup();
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
      builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        let _ = app.get_webview_window("main")
          .expect("no main window")
          .set_focus();
      }));
    }

    let app = builder.plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        // .manage(Mutex::new(ChildProcessState::default()))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            launch_xray,
            close_xray,
            check_ipv6,
            ping,
            get_xray_stats,
            get_system_language,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    build_tray_menu(&app).expect("error building tray menu");

    app.run(move |_app_handle: &tauri::AppHandle, event: RunEvent| {
        match &event {
            RunEvent::ExitRequested { api, code, .. } => {
                // Keep the event loop running even if all windows are closed
                // This allow us to catch tray icon events when there is no window
                // if we manually requested an exit (code is Some(_)) we will let it go through
                if code.is_none() {
                    api.prevent_exit();
                }
            }
            _ => (),
        }
    });
}

fn cleanup() {
    let sysproxy = Sysproxy {
        enable: false,
        host: "localhost".into(),
        port: 1080,
        bypass: "localhost".into(),
    };

    sysproxy
        .set_system_proxy()
        .expect("error disabling system proxy");

    // kill process that listens port 1080/1081 in case xray is not closed properly
    #[cfg(target_family = "windows")]
    {
        use netstat::AddressFamilyFlags;
        use netstat::{get_sockets_info, ProtocolFlags};
        use std::process::Command;
        let sockets = get_sockets_info(
            AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6,
            ProtocolFlags::TCP,
        )
        .expect("error getting sockets info");
        // println!("Found {} sockets", sockets.len());
        use std::collections::HashSet;
        let mut killed_pids = HashSet::new();
        for socket in sockets {
            let local_port = match &socket.protocol_socket_info {
                netstat::ProtocolSocketInfo::Tcp(tcp_info) => tcp_info.local_port,
                netstat::ProtocolSocketInfo::Udp(udp_info) => udp_info.local_port,
            };
            if local_port == 1080 || local_port == 1081 {
                for pid in &socket.associated_pids {
                    if *pid == 0 {
                        continue; // skip PID 0
                    }

                    if killed_pids.insert(*pid) {
                        println!("Killing process with PID {} on port {}", pid, local_port);
                        #[cfg(target_family = "windows")]
                        {
                            use std::os::windows::process::CommandExt;
                            Command::new("taskkill")
                                .arg("/F")
                                .arg("/PID")
                                .arg(pid.to_string())
                                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                                .spawn()
                                .expect("Failed to kill process");
                        }
                    }
                }
            }
        }
    }

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
            for line in stdout.lines().skip(1) {
                // skip header line
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() > 1 {
                    if let Ok(pid) = parts[1].parse::<u32>() {
                        if pid == 0 {
                            continue; // skip PID 0
                        }
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

#[tauri::command]
async fn launch_xray(
    handle: tauri::AppHandle,
    uuid: String,
    pubkey: String,
    server: String,
    port: String,
) -> String {
    cleanup();
    let xray_json_path = handle
        .path()
        .resolve("resources/xray.json", BaseDirectory::Resource)
        .expect("error resolving xray.json path");

    println!("xray_json_path: {:?}", xray_json_path);

    let file = fs::File::open(&xray_json_path).expect("error opening file");

    let mut default_config: serde_json::Value =
        serde_json::from_reader(file).expect("error reading file");

    if let Some(vnext) = default_config["outbounds"][0]["settings"]["vnext"][0].as_object_mut() {
        vnext.insert("address".to_string(), Value::String(server));
        vnext.insert(
            "port".to_string(),
            Value::Number(
                port.parse::<u64>()
                    .expect("error parsing port as u64")
                    .into(),
            ),
        );
        if let Some(user) = vnext["users"][0].as_object_mut() {
            user.insert("id".to_string(), Value::String(uuid.to_string()));
        }
    }

    if let Some(reality_settings) =
        default_config["outbounds"][0]["streamSettings"]["realitySettings"].as_object_mut()
    {
        reality_settings.insert("publicKey".to_string(), Value::String(pubkey.to_string()));
    }

    let config_path = handle
        .path()
        .resolve("resources/config.json", BaseDirectory::Resource)
        .expect("error resolving config.json path");

    let mut file = fs::File::create(&config_path).expect("error creating file");

    println!("config_path: {:?}", config_path);

    file.write_all(
        serde_json::to_string_pretty(&default_config)
            .expect("error serializing to JSON")
            .as_bytes(),
    )
    .expect("error writing to file");

    // start xray process
    let xray_bin = handle
        .path()
        .resolve("xray", BaseDirectory::Resource)
        .expect("error resolving xray executable path");

    println!("xray_bin: {:?}", xray_bin);

    let resources_path = handle
        .path()
        .resolve("resources", BaseDirectory::Resource)
        .expect("error resolving resources path");
    let resources_dir = resources_path.to_str().unwrap();

    let mut cmd = Command::new(xray_bin);
    cmd.env("XRAY_LOCATION_ASSET", resources_dir)
        .env("XRAY_LOCATION_CONFIG", resources_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_family = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    // print cmd
    println!("xray command: {:?}", cmd);

    let mut child = cmd.spawn().expect("Failed to spawn xray process");

    // Simulate CommandEvent handling using std::thread and mpsc
    let (tx, _rx) = mpsc::channel();

    if let Some(stdout) = child.stdout.take() {
        let tx = tx.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.split(b'\n') {
                if let Ok(line) = line {
                    println!("xray stdout: {}", String::from_utf8_lossy(&line));
                    let _ = tx.send(("stdout", line));
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let tx = tx.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.split(b'\n') {
                if let Ok(line) = line {
                    eprintln!("xray stderr: {}", String::from_utf8_lossy(&line));
                    let _ = tx.send(("stderr", line));
                }
            }
        });
    }

    let sysproxy = Sysproxy {
        enable: true,
        host: "127.0.0.1".into(),
        port: 1080,
        bypass: "localhost,127.0.0.1/8".into(),
    };

    sysproxy
        .set_system_proxy()
        .expect("error setting system proxy");

    #[cfg(target_os = "macos")]
    {
        // sysproxy crate sets SOCKS to the same port (1080) as HTTP.
        // We must override the SOCKS proxy to port 1081 for common Mac interfaces.
        use std::process::Command;
        for service in ["Wi-Fi", "Ethernet"] {
            let _ = Command::new("networksetup")
                .args(["-setsocksfirewallproxy", service, "127.0.0.1", "1081"])
                .output();
            let _ = Command::new("networksetup")
                .args(["-setsocksfirewallproxystate", service, "on"])
                .output();
        }
    }

    let child_pid = child.id().to_string();
    let main_pid = std::process::id().to_string();

    let cleanup_bin_path = handle
        .path()
        .resolve("cleanup", BaseDirectory::Resource)
        .expect("error resolving cleanup binary path");

    // run a command to shut down xray and then run cleanup_bin in case exit accidentally
    #[cfg(target_family = "unix")]
    {
        use tauri_plugin_shell::ShellExt;
        handle
            .shell()
            .command("/bin/bash")
            .arg("-c")
            .arg(format!(
                "while kill -0 {} 2>/dev/null; do sleep 0.5; done; kill {}; '{}'",
                child_pid,
                main_pid,
                cleanup_bin_path.display()
            ))
            .spawn()
            .expect("Failed to spawn shutdown command");
    } // TODO: not tested yet

    #[cfg(target_family = "windows")]
    {
        use std::os::windows::process::CommandExt;

        let mut cmd = Command::new("powershell.exe");

        cmd.arg("-Command")
            .arg(format!(
                r#"
            while ((Get-Process -Id {} -ErrorAction SilentlyContinue) -ne $null) {{
              Start-Sleep -Milliseconds 500
            }}
            Stop-Process -Id {} -Force
            Start-Process -FilePath "{}.exe"
            "#,
                main_pid,
                child_pid,
                cleanup_bin_path.display()
            ))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        cmd.spawn().expect("Failed to spawn shutdown command");
    }

    child_pid
}

#[tauri::command]
fn close_xray(_pid: String) {
    /*
    let pid = pid.parse::<u32>().expect("error parsing PID");
    println!("Killing xray process with PID: {}", pid);

    #[cfg(target_family = "unix")]
    {
        use std::process::Command;

      Command::new("kill")
        .args(&["-9", &pid.to_string()])
        .spawn()
        .expect("Failed to kill xray process");
    }

    #[cfg(target_family = "windows")]
    {
      Command::new("taskkill")
        .args(&["/F", "/PID", &pid.to_string()])
        .spawn()
        .expect("Failed to kill xray process");
    }  */

    cleanup();
}

#[tauri::command]
fn check_ipv6() -> bool {
    let addr = "[2001:4860:4860::8888]:53"; // Google IPv6 DNS
    TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_secs(2)).is_ok()
}

#[tauri::command] // return latency in ms as string
async fn ping(address: String) -> String {
    // convert address to IP address
    let Ok(addr) = tokio::net::lookup_host(format!("{}:0", address)).await.and_then(|mut addrs| addrs.next().ok_or(std::io::Error::new(std::io::ErrorKind::NotFound, "No addresses found"))) else {
        eprintln!("Failed to resolve host: {}", address);
        return "error".to_string();
    };

    // create Ping client
    let client = Client::new(&Config::default()).unwrap();
    let ident = PingIdentifier(1234); // random identifier
    let mut pinger = client.pinger(addr.ip(), ident).await;
    pinger.timeout(Duration::from_secs(2)); // set timeout

    let mut latencies: Vec<u128> = Vec::new();
    let total_pings = 4;

    for i in 0..total_pings {
        match pinger.ping(PingSequence(i as u16), &[0; 8]).await {
            Ok((_reply, duration)) => {
                latencies.push(duration.as_millis());
            }
            Err(e) => {
                eprintln!("Ping #{} failed: {}", i + 1, e);
            }
        }
    }
    
    if latencies.is_empty() {
        "error".to_string()
    } else {
        let sum: u128 = latencies.iter().sum();
        let avg = sum / latencies.len() as u128;
        format!("{:}", avg) // return average latency as string
    }
}

fn build_tray_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit_i])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                println!("quit menu item was clicked");
                app.exit(0);
            }
            _ => {
                println!("menu item {:?} not handled", event.id);
            }
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => {
                println!("left click pressed and released");
                // in this example, let's show and focus the main window when the tray is clicked
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {
                println!("unhandled event {event:?}");
            }
        })
        .build(app)?;
    Ok(())
}

#[tauri::command]
async fn get_xray_stats(handle: tauri::AppHandle) -> String {
    let xray_bin = handle
        .path()
        .resolve("xray", BaseDirectory::Resource)
        .expect("error resolving xray executable path");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let output = Command::new(xray_bin)
            .arg("api")
            .arg("statsquery")
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .expect("Failed to execute xray stats command");

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout.to_string()
        } else {
            let _stderr = String::from_utf8_lossy(&output.stderr);
            return "{}".to_string();
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new(xray_bin)
            .arg("api")
            .arg("statsquery")
            .output()
            .expect("Failed to execute xray stats command");

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout.to_string()
        } else {
            let _stderr = String::from_utf8_lossy(&output.stderr);
            return "{}".to_string();
        }
    }
}

#[tauri::command]
async fn get_system_language() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Globalization::GetUserDefaultLocaleName;

        let mut buffer = [0u16; 85]; // LOCALE_NAME_MAX_LENGTH = 85
        let len = unsafe { GetUserDefaultLocaleName(&mut buffer) };
        if len > 0 {
            if let Ok(locale) = String::from_utf16(&buffer[..(len as usize - 1)]) {
                // "en-US" -> "en"
                return locale.split('-').next().map(|s| s.to_lowercase());
            }
        }
        None
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        use std::env;
        env::var("LC_ALL")
            .ok()
            .filter(|v| !v.is_empty())
            .or_else(|| env::var("LANG").ok())
            .map(|lang| {
                let lang = lang.split('.').next().unwrap_or(&lang);
                let lang = lang.split('_').next().unwrap_or(lang);
                lang.to_lowercase()
            })
    }
}
