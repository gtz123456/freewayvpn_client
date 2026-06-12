use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

/// Resolves `host` (bare hostname or IP, no port) to an [`IpAddr`].
pub async fn resolve(host: &str) -> Option<IpAddr> {
    tokio::net::lookup_host(format!("{}:0", host))
        .await
        .ok()?
        .next()
        .map(|s| s.ip())
}

/// Races TCP connects to `ip` on each of `ports` concurrently.
///
/// Returns the RTT in milliseconds of the **fastest** successful handshake,
/// or `None` if every probe fails or times out.
///
/// Works on all platforms: Android, iOS, Windows, macOS, Linux.
pub async fn tcp_ping(ip: IpAddr, ports: &[u16], timeout_ms: u64) -> Option<u128> {
    let mut set = tokio::task::JoinSet::new();
    for &port in ports {
        let target = SocketAddr::new(ip, port);
        let timeout = Duration::from_millis(timeout_ms);
        set.spawn(async move {
            let start = std::time::Instant::now();
            tokio::time::timeout(timeout, tokio::net::TcpStream::connect(target))
                .await
                .ok()? // timeout elapsed → None
                .ok()  // IO error       → None
                .map(|_| start.elapsed().as_millis())
        });
    }

    let mut best: Option<u128> = None;
    while let Some(res) = set.join_next().await {
        if let Ok(Some(ms)) = res {
            best = Some(best.map_or(ms, |b: u128| b.min(ms)));
        }
    }
    best
}
