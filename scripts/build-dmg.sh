#!/bin/sh
# Produce a polished, drag-to-Applications dist/Mandate-<version>.dmg with a
# branded background, positioned app + Applications alias, and a custom volume
# icon. Uses appdmg (works headless / in CI); falls back to a plain DMG offline.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(awk -F'"' '/^version =/{print $2; exit}' Cargo.toml)"
FINAL="$ROOT/dist/Mandate-${VERSION}.dmg"
BG="$ROOT/packaging/assets/background.png"
ICON="$ROOT/packaging/assets/app.icns"

sh "$ROOT/scripts/build-app.sh"

echo "› Building disk image…"
rm -f "$FINAL"
SPEC="$(mktemp -d)/appdmg.spec.json"
cat > "$SPEC" <<SPEC_JSON
{
  "title": "Mandate",
  "icon": "$ICON",
  "background": "$BG",
  "icon-size": 80,
  "format": "UDZO",
  "window": { "position": { "x": 200, "y": 120 }, "size": { "width": 720, "height": 460 } },
  "contents": [
    { "x": 180, "y": 245, "type": "file", "path": "$ROOT/dist/Mandate.app" },
    { "x": 540, "y": 245, "type": "link", "path": "/Applications" }
  ]
}
SPEC_JSON

if command -v npx >/dev/null 2>&1 && npx --yes appdmg "$SPEC" "$FINAL" >/tmp/mandate_appdmg.log 2>&1; then
  :
else
  echo "  (appdmg unavailable or failed; building plain DMG. See /tmp/mandate_appdmg.log)"
  STAGING="$(mktemp -d)"
  trap 'rm -rf "$STAGING" "$SPEC" 2>/dev/null || true' EXIT
  cp -R "$ROOT/dist/Mandate.app" "$STAGING/"
  ln -s /Applications "$STAGING/Applications"
  [ -f "$ICON" ] && cp "$ICON" "$STAGING/.VolumeIcon.icns"
  rm -f "$FINAL"
  hdiutil create -volname "Mandate" -srcfolder "$STAGING" -ov -format UDZO "$FINAL" >/dev/null
fi
rm -f "$SPEC" 2>/dev/null || true

echo "✓ Built $FINAL"
echo "  Open with: open $FINAL"
