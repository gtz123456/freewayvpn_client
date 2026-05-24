# FreewayVPN Client

update "url": "http://170.9.29.245:8080/*"

# Dev

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

Xray-core is executed as a standalone binary on Android, packaged as `libxray.so` so that Gradle includes it in the APK. CGO must be enabled with the NDK clang compiler — do **not** use `android/386` (it will fail with a CGO linking error).

**Build all ABIs at once:**

```powershell
cd D:\VPN\Xray-core

$NDK = "$env:ANDROID_HOME\ndk\29.0.14206865\toolchains\llvm\prebuilt\windows-x86_64\bin"
$OUT = "D:\VPN\FreewayVPN_Client\src-tauri\gen\android\app\src\main\jniLibs"
$env:CGO_ENABLED = "1"
$env:GOOS = "android"

# arm64-v8a  (real devices)
$env:GOARCH = "arm64";  $env:CC = "$NDK\aarch64-linux-android24-clang.cmd"
go build -o "$OUT\arm64-v8a\libxray.so" -trimpath -ldflags="-s -w" ./main

# armeabi-v7a  (older 32-bit devices)
$env:GOARCH = "arm";    $env:CC = "$NDK\armv7a-linux-androideabi24-clang.cmd"; $env:GOARM = "7"
go build -o "$OUT\armeabi-v7a\libxray.so" -trimpath -ldflags="-s -w" ./main

# x86_64  (emulator)
$env:GOARCH = "amd64";  $env:CC = "$NDK\x86_64-linux-android24-clang.cmd"
go build -o "$OUT\x86_64\libxray.so" -trimpath -ldflags="-s -w" ./main
```

### 2. Dev (run on emulator or connected device)

```bash
pnpm tauri android dev
```

### 3. Build (produce APK / AAB)

```bash
pnpm tauri android build
```
