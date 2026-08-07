#!/bin/sh
# Install Mandate from a GitHub release DMG.
#
#   curl -fsSL https://raw.githubusercontent.com/richardsondx/Mandate/main/scripts/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/richardsondx/Mandate/main/scripts/install.sh | sh -s -- --launch-agent
#
# Overrides via environment:
#   MANDATE_VERSION=0.1.0  MANDATE_REPO=richardsondx/Mandate  sh install.sh
set -eu

VERSION="${MANDATE_VERSION:-0.1.0}"
REPO="${MANDATE_REPO:-richardsondx/Mandate}"
ASSET="Mandate-${VERSION}.dmg"
URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"
APP_DST="/Applications/Mandate.app"
INSTALL_AGENT=0
for arg in "$@"; do
  case "$arg" in
    --launch-agent) INSTALL_AGENT=1 ;;
    --version=*) VERSION="${arg#*=}" ;;
  esac
done
URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"

TMP="$(mktemp -d)"
MNT="$TMP/mnt"
trap 'hdiutil detach "$MNT" -quiet 2>/dev/null || true; rm -rf "$TMP"' EXIT

echo "› Downloading $URL"
curl -fSL "$URL" -o "$TMP/$ASSET"

echo "› Mounting disk image…"
hdiutil attach "$TMP/$ASSET" -nobrowse -noautoopen -mountpoint "$MNT" >/dev/null

echo "› Installing to $APP_DST …"
rm -rf "$APP_DST"
cp -R "$MNT/Mandate.app" "$APP_DST"
echo "✓ Installed $APP_DST"

if [ "$INSTALL_AGENT" = "1" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.mandate.mandated.plist"
  mkdir -p "$(dirname "$PLIST")"
  sed -e "s#__APP__#${APP_DST}#g" -e "s#__HOME__#${HOME}#g" \
    "$(dirname "$0")/../packaging/com.mandate.mandated.plist.template" > "$PLIST" 2>/dev/null || true
  if [ ! -f "$PLIST" ]; then
    # curl-piped path: template not next to the script; inline it.
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.mandate.mandated</string>
  <key>ProgramArguments</key>
  <array><string>${APP_DST}/Contents/MacOS/mandated</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MANDATE_WEB_DIR</key><string>${APP_DST}/Contents/Resources/dashboard</string>
    <key>MANDATE_PROVIDERS_DIR</key><string>${APP_DST}/Contents/Resources/providers</string>
    <key>MANDATE_MCP_ENTRY</key><string>${APP_DST}/Contents/Resources/mcp/dist/index.js</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${HOME}/Library/Logs/mandated.log</string>
  <key>StandardErrorPath</key><string>${HOME}/Library/Logs/mandated.log</string>
</dict>
</plist>
PL
  fi
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST" 2>/dev/null || true
  echo "✓ LaunchAgent installed (daemon starts on login). Logs: $HOME/Library/Logs/mandated.log"
fi

echo "› Opening Mandate…"
sleep 1
open "$APP_DST"
echo "Done. Dashboard: http://127.0.0.1:7741/"
