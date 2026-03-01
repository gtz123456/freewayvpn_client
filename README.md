# FreewayVPN Client

## Prerequisites

- [Node.js](https://nodejs.org/) & [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/)
- [Go](https://go.dev/) (for compiling Xray-core)
- [Android SDK & NDK](https://developer.android.com/studio) (for Android builds)

---

## Desktop

### Dev

```bash
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

---

## Android

### 1. Compile Xray-core for Android

Xray-core is executed as a standalone binary on Android, packaged as `libxray.so` so that Gradle includes it in the APK.

**For emulator (x86_64):**

```powershell
cd D:\VPN\Xray-core

$env:CGO_ENABLED="1"
$env:GOOS="android"
$env:GOARCH="amd64"
$env:CC="$env:ANDROID_HOME\ndk\29.0.14206865\toolchains\llvm\prebuilt\windows-x86_64\bin\x86_64-linux-android24-clang.cmd"

go build -o "D:\VPN\FreewayVPN_Client\src-tauri\gen\android\app\src\main\jniLibs\x86_64\libxray.so" -trimpath -ldflags="-s -w" ./main
```

**For real device (arm64-v8a):**

```powershell
cd D:\VPN\Xray-core

$env:CGO_ENABLED="1"
$env:GOOS="android"
$env:GOARCH="arm64"
$env:CC="$env:ANDROID_HOME\ndk\29.0.14206865\toolchains\llvm\prebuilt\windows-x86_64\bin\aarch64-linux-android24-clang.cmd"

go build -o "D:\VPN\FreewayVPN_Client\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a\libxray.so" -trimpath -ldflags="-s -w" ./main
```

> **Note:** The `proxy/tun` package (with `tun_android.go`) must be registered in `main/distro/all/all.go` so xray can handle the TUN inbound protocol on Android.

### 2. Dev (run on emulator or connected device)

```bash
pnpm tauri android dev
```

### 3. Build (produce APK / AAB)

```bash
pnpm tauri android build
```
