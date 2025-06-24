use sysproxy::Sysproxy;

fn main() {
    cleanup();
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

    // write success message to ./cleanup.log
    let log_message = "System proxy disabled successfully.";
    std::fs::write("cleanup.log", log_message)
        .expect("error writing to cleanup.log");
    println!("{}", log_message);
    
}