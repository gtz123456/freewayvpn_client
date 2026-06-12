fn main() {
    let mut windows = tauri_build::WindowsAttributes::new();
    windows = windows.app_manifest(
        r#"
    <assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
      <dependency>
        <dependentAssembly>
          <assemblyIdentity
            type="win32"
            name="Microsoft.Windows.Common-Controls"
            version="6.0.0.0"
            processorArchitecture="*"
            publicKeyToken="6595b64144ccf1df"
            language="*"
          />
        </dependentAssembly>
      </dependency>
      <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
        <security>
            <requestedPrivileges>
                <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
            </requestedPrivileges>
        </security>
      </trustInfo>
    </assembly>
    "#,
    );
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run build script");

    // On iOS, the Swift @_cdecl symbols (write_xray_config, start_vpn_extension, etc.)
    // are compiled by Xcode into the app binary AFTER Rust builds its dylib.
    // We allow these symbols to be undefined at Rust link time;
    // Xcode resolves them when it links the final app binary.
    //
    // NOTE: #[cfg(target_os)] in build.rs reflects the HOST (macOS), not the
    // cross-compile target. We must use CARGO_CFG_TARGET_OS env var instead.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "ios" {
        for sym in &[
            "_write_xray_config",
            "_start_vpn_extension",
            "_stop_vpn_extension",
            "_get_vpn_status",
        ] {
            println!("cargo:rustc-link-arg=-Wl,-U,{}", sym);
        }
    }
}
