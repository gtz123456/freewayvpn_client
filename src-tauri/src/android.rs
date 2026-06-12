use std::net::TcpStream;
use std::time::Duration;
use surge_ping::{Client, Config, PingIdentifier, PingSequence};
use tauri::{Emitter, Manager};

use crate::vpn_plugin::VpnMobile;

// ──────────────────────────────────────────────────────────────────────────────
// JNI helper: native posix_spawn so xray inherits the TUN fd.
//
// Java's ProcessBuilder always calls closefds=true in forkAndExec, closing every
// fd above stderr before exec. posix_spawn() from native code respects POSIX
// FD inheritance rules: all fds without FD_CLOEXEC are inherited.
// We clear FD_CLOEXEC on the TUN fd, then posix_spawn, and xray reads it
// directly from the env var "xray.tun.fd".
//
// fork() is blocked by Android's seccomp untrusted_app policy. posix_spawn()
// uses clone(CLONE_VM|CLONE_VFORK) which IS in the allowlist.
// ──────────────────────────────────────────────────────────────────────────────

/// JNI signature:
///   private external fun nativeForkExec(
///       program: String,
///       args: Array<String>,
///       envs: Array<String>,
///       tunFd: Int,
///       workDir: String,   // unused — all paths are absolute
///   ): Int
///
/// Returns child PID on success, -1 on error.
#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "system" fn Java_com_freewayvpnclient_app_FreeWayVpnService_nativeForkExec(
    env: *mut jni_sys::JNIEnv,
    _class: jni_sys::jclass,
    program_obj: jni_sys::jstring,
    args_obj: jni_sys::jobjectArray,
    envs_obj: jni_sys::jobjectArray,
    tun_fd: jni_sys::jint,
    _work_dir_obj: jni_sys::jstring,
) -> jni_sys::jint {
    use std::ffi::{CStr, CString};

    // jni_sys::JNINativeInterface_ is generated from jni.h — all offsets correct
    let jni = &**env;

    let jstr_to_cstring = |s: jni_sys::jstring| -> CString {
        if s.is_null() {
            return CString::default();
        }
        let ptr = jni.GetStringUTFChars.unwrap()(env, s, std::ptr::null_mut());
        if ptr.is_null() {
            return CString::default();
        }
        let cs = CStr::from_ptr(ptr).to_owned();
        jni.ReleaseStringUTFChars.unwrap()(env, s, ptr);
        cs
    };

    let arr_to_cstrings = |arr: jni_sys::jobjectArray| -> Vec<CString> {
        if arr.is_null() {
            return Vec::new();
        }
        let len = jni.GetArrayLength.unwrap()(env, arr);
        (0..len)
            .map(|i| {
                jstr_to_cstring(jni.GetObjectArrayElement.unwrap()(env, arr, i) as jni_sys::jstring)
            })
            .collect()
    };

    let program_cs = jstr_to_cstring(program_obj);
    let args_cs = arr_to_cstrings(args_obj);
    let envs_cs = arr_to_cstrings(envs_obj);

    let mut argv: Vec<*const libc::c_char> = args_cs.iter().map(|s| s.as_ptr()).collect();
    argv.push(std::ptr::null());
    let mut envp: Vec<*const libc::c_char> = envs_cs.iter().map(|s| s.as_ptr()).collect();
    envp.push(std::ptr::null());

    // Clear FD_CLOEXEC — posix_spawn inherits all fds without this flag
    libc::fcntl(tun_fd, libc::F_SETFD, 0_i32);

    #[allow(non_camel_case_types)]
    type posix_spawn_file_actions_t = [u8; 80]; // opaque; oversized is safe

    extern "C" {
        fn posix_spawn(
            pid: *mut libc::pid_t,
            path: *const libc::c_char,
            file_actions: *const posix_spawn_file_actions_t,
            attrp: *const libc::c_void,
            argv: *const *const libc::c_char,
            envp: *const *const libc::c_char,
        ) -> libc::c_int;
        fn posix_spawn_file_actions_init(acts: *mut posix_spawn_file_actions_t) -> libc::c_int;
        fn posix_spawn_file_actions_destroy(acts: *mut posix_spawn_file_actions_t) -> libc::c_int;
    }

    let mut file_actions: posix_spawn_file_actions_t = [0u8; 80];
    posix_spawn_file_actions_init(&mut file_actions);
    let mut child_pid: libc::pid_t = 0;
    let ret = posix_spawn(
        &mut child_pid,
        program_cs.as_ptr(),
        &file_actions,
        std::ptr::null(),
        argv.as_ptr(),
        envp.as_ptr(),
    );
    posix_spawn_file_actions_destroy(&mut file_actions);
    if ret != 0 {
        -1
    } else {
        child_pid
    }
}

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
    let port_num: u16 = port.parse().unwrap_or(443);
    let payload = serde_json::json!({
        "uuid":   uuid,
        "server": server,
        "port":   port_num,
        "pubkey": pubkey,
    });

    let vpn = handle.state::<VpnMobile<tauri::Wry>>();
    match vpn.start_vpn(payload) {
        Ok(v) => {
            let status = v["status"].as_str().unwrap_or("");
            if status == "permission_granted" {
                // User just granted permission; JS should call launch_xray again
                "permission_granted".to_string()
            } else {
                "ok".to_string()
            }
        }
        Err(e) => format!("error: {}", e),
    }
}

#[tauri::command]
async fn close_xray(handle: tauri::AppHandle, _pid: String) {
    let vpn = handle.state::<VpnMobile<tauri::Wry>>();
    let _ = vpn.stop_vpn();
}

#[tauri::command]
async fn get_xray_stats(_handle: tauri::AppHandle) -> String {
    "{}".to_string()
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
    // DNS resolve once, shared by both strategies.
    let Ok(addr) = tokio::net::lookup_host(format!("{}:0", address))
        .await
        .and_then(|mut addrs| {
            addrs
                .next()
                .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no addr"))
        })
    else {
        eprintln!("[ping] DNS failed for {}", address);
        return "error".to_string();
    };

    // --- Strategy 2: TCP RTT (emulator / firewall fallback) ---
    match crate::util::tcp_ping(addr.ip(), &[443, 80, 8443], 2000).await {
        Some(ms) => format!("{}", ms),
        None => {
            eprintln!("[ping] all probes to {} failed", address);
            "error".to_string()
        }
    }
}

// ======================================================
// App 入口
// ======================================================

pub fn run() {
    tauri::Builder::default()
        .plugin(crate::vpn_plugin::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            launch_xray,
            close_xray,
            check_ipv6,
            ping,
            get_xray_stats,
            get_system_language,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
