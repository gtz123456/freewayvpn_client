// mobile.rs — iOS 平台实现
// 通过 Swift VPNManager.swift 导出的 C 函数与 NEVPNManager 通信

use std::ffi::{CString, CStr};
use std::net::TcpStream;
use std::time::Duration;
use tauri::Emitter;

// ======================================================
// Swift 侧 C 函数声明
// 对应 VPNManager.swift 里的 @_cdecl 导出
// ======================================================
extern "C" {
    /// 将 JSON 配置写入 App Group 共享目录。返回 true 表示成功。
    fn write_xray_config(json_c_str: *const std::os::raw::c_char) -> bool;

    /// 通过 NEVPNManager 启动 xrayService Extension（异步）。
    fn start_vpn_extension();

    /// 通过 NEVPNManager 停止 xrayService Extension（异步）。
    fn stop_vpn_extension();

    /// 查询当前 VPN 连接状态。返回的指针指向静态存储，需立即复制。
    fn get_vpn_status() -> *const std::os::raw::c_char;
}

// ======================================================
// Tauri 命令实现
// ======================================================

/// 构建 Xray JSON 配置（VLESS+Reality+SOCKS5 出口）
fn build_xray_config(uuid: &str, pubkey: &str, server: &str, port: &str) -> serde_json::Value {
    serde_json::json!({
        "log": {
            "loglevel": "warning"
        },
        "inbounds": [
            {
                "tag": "socks",
                "port": 1080,
                "listen": "127.0.0.1",
                "protocol": "socks",
                "settings": {
                    "auth": "noauth",
                    "udp": true
                }
            },
            {
                "tag": "http",
                "port": 1081,
                "listen": "127.0.0.1",
                "protocol": "http"
            }
        ],
        "outbounds": [
            {
                "tag": "proxy",
                "protocol": "vless",
                "settings": {
                    "vnext": [
                        {
                            "address": server,
                            "port": port.parse::<u16>().unwrap_or(443),
                            "users": [
                                {
                                    "id": uuid,
                                    "encryption": "none",
                                    "flow": "xtls-rprx-vision"
                                }
                            ]
                        }
                    ]
                },
                "streamSettings": {
                    "network": "tcp",
                    "security": "reality",
                    "realitySettings": {
                        "serverName": "www.apple.com",
                        "fingerprint": "chrome",
                        "publicKey": pubkey,
                        "shortId": ""
                    }
                }
            },
            {
                "tag": "direct",
                "protocol": "freedom"
            },
            {
                "tag": "block",
                "protocol": "blackhole"
            }
        ],
        "routing": {
            "domainStrategy": "IPIfNonMatch",
            "rules": [
                {
                    "type": "field",
                    "ip": ["geoip:private"],
                    "outboundTag": "direct"
                }
            ]
        }
    })
}

/// 辅助宏：向前端发送 vpn-log 事件
macro_rules! vpn_log {
    ($handle:expr, $type:expr, $msg:expr) => {{
        let _ = $handle.emit("vpn-log", serde_json::json!({ "type": $type, "msg": $msg }));
    }};
}

#[tauri::command]
async fn launch_xray(
    handle: tauri::AppHandle,
    uuid: String,
    pubkey: String,
    server: String,
    port: String,
) -> String {
    vpn_log!(handle, "info", format!("正在连接 {}:{}", server, port));

    // 1. 构建配置 JSON
    let config = build_xray_config(&uuid, &pubkey, &server, &port);
    let config_json = match serde_json::to_string_pretty(&config) {
        Ok(s) => s,
        Err(e) => {
            vpn_log!(handle, "error", format!("配置序列化失败: {}", e));
            return format!("error: failed to serialize config: {}", e);
        }
    };

    // 2. 将配置写入 App Group 共享目录（Swift 函数）
    let c_json = match CString::new(config_json) {
        Ok(s) => s,
        Err(e) => {
            vpn_log!(handle, "error", format!("配置字符串无效: {}", e));
            return format!("error: invalid config string: {}", e);
        }
    };

    let write_ok = unsafe { write_xray_config(c_json.as_ptr()) };
    if !write_ok {
        vpn_log!(handle, "error", "写入 App Group 失败，请检查 App Group 配置");
        return "error: failed to write xray config to App Group".to_string();
    }
    vpn_log!(handle, "info", "配置已写入，正在启动 VPN Extension...");

    // 3. 启动 VPN Extension（Swift 函数，内部调用 NEVPNManager，异步完成）
    unsafe { start_vpn_extension() };
    vpn_log!(handle, "success", "VPN 启动请求已发送");

    "ok".to_string()
}

#[tauri::command]
async fn close_xray(handle: tauri::AppHandle, _pid: String) {
    vpn_log!(handle, "info", "正在断开 VPN...");
    unsafe { stop_vpn_extension() };
    vpn_log!(handle, "info", "VPN 已断开");
}

#[tauri::command]
async fn get_xray_stats(_handle: tauri::AppHandle) -> String {
    // TODO: 未来可以通过 Xray API（gRPC 或 HTTP）获取真实流量统计
    // 目前返回简单的连接状态
    let status = unsafe {
        let ptr = get_vpn_status();
        CStr::from_ptr(ptr).to_string_lossy().to_string()
    };
    format!("{{\"status\":\"{}\"}}", status)
}

#[tauri::command]
fn check_ipv6() -> bool {
    let addr = "[2001:4860:4860::8888]:53";
    TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_secs(2)).is_ok()
}

#[tauri::command]
async fn get_system_language() -> Option<String> {
    None
}

#[tauri::command]
async fn ping(address: String) -> String {
    // iOS 沙箱不允许 ICMP 原始 socket，改用 TCP 握手时间近似 RTT。
    // 连接到 443 端口，测量 TCP 连接建立耗时，重复 4 次取平均值。
    const PROBE_PORT: u16 = 443;
    const TOTAL_PINGS: usize = 4;
    const TIMEOUT_SECS: u64 = 2;

    // DNS 解析
    let host = format!("{}:{}", address, PROBE_PORT);
    let addr = match tokio::net::lookup_host(&host).await {
        Ok(mut addrs) => match addrs.next() {
            Some(a) => a,
            None => {
                eprintln!("[ping] No address found for {}", address);
                return "error".to_string();
            }
        },
        Err(e) => {
            eprintln!("[ping] DNS lookup failed for {}: {}", address, e);
            return "error".to_string();
        }
    };

    let mut latencies: Vec<u128> = Vec::new();

    for i in 0..TOTAL_PINGS {
        let start = std::time::Instant::now();
        match tokio::time::timeout(
            Duration::from_secs(TIMEOUT_SECS),
            tokio::net::TcpStream::connect(addr),
        )
        .await
        {
            Ok(Ok(_stream)) => {
                // 连接成功即关闭，我们只需要握手耗时
                latencies.push(start.elapsed().as_millis());
            }
            Ok(Err(e)) => {
                eprintln!("[ping] #{} connect error: {}", i + 1, e);
            }
            Err(_) => {
                eprintln!("[ping] #{} timeout", i + 1);
            }
        }
    }

    if latencies.is_empty() {
        "error".to_string()
    } else {
        let avg = latencies.iter().sum::<u128>() / latencies.len() as u128;
        format!("{}", avg)
    }
}

// ======================================================
// App 入口
// ======================================================

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
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
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}