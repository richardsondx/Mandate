#!/bin/sh
# Build Mandate.app at dist/Mandate.app — a macOS menu-bar resident app
# (Ollama-style) that runs the bundled `mandated` daemon and opens the dashboard.
# Core experience (daemon + dashboard) needs no Node runtime; bundled
# provider/MCP assets are included and used when Node is available.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(awk -F'"' '/^version =/{print $2; exit}' Cargo.toml)"
APP="$ROOT/dist/Mandate.app"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing required tool: $1" >&2; exit 1; }; }
need cargo; need pnpm; need node; need swiftc

echo "› Building Rust binaries (release)…"
cargo build --release -p mandated

echo "› Building dashboard…"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm --dir web build

echo "› Building provider + MCP packages…"
pnpm -r --if-present build

echo "› Compiling menu-bar app (Swift)…"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O -parse-as-library -framework AppKit -framework WebKit -framework Foundation \
  "$ROOT/packaging/app/MandateApp.swift" -o "$APP/Contents/MacOS/Mandate"

echo "› Assembling Mandate.app…"
# Daemon (run as a child of the menu-bar app)
cp "$ROOT/target/release/mandated" "$APP/Contents/MacOS/mandated"

# Dashboard
rm -rf "$APP/Contents/Resources/dashboard"
cp -R "$ROOT/web/dist" "$APP/Contents/Resources/dashboard"

# App icon
if [ -f "$ROOT/packaging/assets/app.icns" ]; then
  cp "$ROOT/packaging/assets/app.icns" "$APP/Contents/Resources/app.icns"
fi

# Providers + their workspace SDK (used only when Node is installed)
if [ -d "$ROOT/providers/coinbase-cdp-wallet/dist" ]; then
  mkdir -p "$APP/Contents/Resources/providers"
  for p in coinbase-cdp-wallet stripe-revenue lithic-card bridge-rail; do
    if [ -d "$ROOT/providers/$p/dist" ]; then
      mkdir -p "$APP/Contents/Resources/providers/$p"
      cp -R "$ROOT/providers/$p/dist" "$APP/Contents/Resources/providers/$p/dist"
      mkdir -p "$APP/Contents/Resources/providers/$p/node_modules/@mandate"
      cp -R "$ROOT/packages/provider-sdk" "$APP/Contents/Resources/providers/$p/node_modules/@mandate/provider-sdk"
      rm -rf "$APP/Contents/Resources/providers/$p/node_modules/@mandate/provider-sdk/node_modules"
    fi
  done
fi

# MCP server (used only when Node is installed)
if [ -d "$ROOT/packages/mcp/dist" ]; then
  mkdir -p "$APP/Contents/Resources/mcp"
  cp -R "$ROOT/packages/mcp/dist" "$APP/Contents/Resources/mcp/dist"
fi

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Mandate</string>
  <key>CFBundleDisplayName</key><string>Mandate</string>
  <key>CFBundleIdentifier</key><string>com.mandate.app</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleExecutable</key><string>Mandate</string>
  <key>CFBundleIconFile</key><string>app</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
</dict>
</plist>
PLIST

echo "✓ Built $APP (${VERSION})"
