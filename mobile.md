# FreewayVPN Client — iOS 编译打包流程

## 前置环境（仅首次）

```bash
# 1. 安装 gomobile 和 gobind
go install golang.org/x/mobile/cmd/gomobile@latest
go install golang.org/x/mobile/cmd/gobind@latest
$HOME/go/bin/gomobile init

# 2. 安装 iOS 工具链
brew install xcodegen libimobiledevice cocoapods

# 3. 安装 Node 依赖
cd /Users/gao/Documents/vpn/freewayvpn_client
pnpm install
```

---

## 每次改动后的完整流程

### Step 1：编译 Xray Go 核心 → xcframework

**当 Xray-core 代码有变动时需要执行。**

```bash
cd /Users/gao/Documents/vpn/Xray-core
bash build_libxray_ios.sh
```

输出：`gen/apple/Libxray.xcframework`

> **注意**：`build_libxray_ios.sh` 会直接把 xcframework 复制到
> `freewayvpn_client/src-tauri/gen/apple/Libxray.xcframework`。

---

### Step 2：重新生成 Xcode 项目

**当 `project.yml` 有变动时需要执行。**

```bash
cd /Users/gao/Documents/vpn/freewayvpn_client
pnpm tauri ios init
```

---

### Step 3：开发模式（打开 Xcode）

```bash
cd /Users/gao/Documents/vpn/freewayvpn_client
pnpm tauri ios dev --open
```

Xcode 打开后：
1. 选中 `freewayvpn_client_iOS` target → **Signing & Capabilities** → 选择你的 **Team**
2. 对 `xrayService` target 重复上一步
3. 选择模拟器或真机，按 **⌘+B** 编译，**⌘+R** 运行

---

### Step 4：打包 IPA（发布）

```bash
cd /Users/gao/Documents/vpn/freewayvpn_client
pnpm tauri ios build
```

或在 Xcode 中：**Product → Archive → Distribute App**

---

## 文件结构速查

| 文件 | 作用 |
|---|---|
| `Xray-core/libxray/libxray.go` | Go 核心 API（Start/Stop/IsRunning） |
| `Xray-core/build_libxray_ios.sh` | 编译 xcframework 的脚本 |
| `gen/apple/Libxray.xcframework` | 编译产物，Xcode 引用此文件 |
| `gen/apple/project.yml` | xcodegen 配置（含 xrayService target） |
| `gen/apple/xrayService/PacketTunnelProvider.swift` | VPN Extension 入口 |
| `gen/apple/Sources/freewayvpn_client/VPNManager.swift` | Swift FFI 层（@_cdecl 导出） |
| `src-tauri/src/mobile.rs` | Rust 命令层（launch_xray/close_xray） |
| `src-tauri/build.rs` | 为 iOS 添加 `-Wl,-U` 链接标志 |

---

## 常见问题

### Q: `There is no XCFramework found at .../Libxray.xcframework`
**A:** 重新运行 Step 1，然后 Step 2。

### Q: `Multiple commands produce .../Libxray.framework`
**A:** `gen/apple/` 下有两份 xcframework（根目录 + `Externals/`），删掉多余的：
```bash
rm -rf src-tauri/gen/apple/Externals/Libxray.xcframework
pnpm tauri ios init
```

### Q: `gomobile: gobind was not found`
**A:**
```bash
go install golang.org/x/mobile/cmd/gobind@latest
$HOME/go/bin/gomobile init
```

### Q: Rust 链接报 `Undefined symbols: _start_vpn_extension` 等
**A:** 这些 Swift 符号由 Xcode 最终链接时注入，`build.rs` 里已经用 `-Wl,-U` 处理。如果仍报错，确认 `CARGO_CFG_TARGET_OS` 检测正常（见 `build.rs`）。
