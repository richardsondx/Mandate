#!/bin/sh
# Regenerate packaging/assets/app.icns and the DMG backgrounds from their SVG
# sources. Prefers a headless Chromium render (crisp text + exact geometry);
# falls back to ImageMagick if no Chromium is found.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
A="packaging/assets"
mkdir -p "$A"

find_chrome() {
  for c in \
    "$HOME/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
    "$HOME/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    [ -x "$c" ] && { echo "$c"; return 0; }
  done
  return 1
}

render_svg() { # $1=svg $2=outpng $3=w $4=h
  svg="$1"; out="$2"; w="$3"; h="$4"
  if CHROME=$(find_chrome); then
    cat > /tmp/mnd_wrap.html <<HTML
<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{display:block;width:${w}px;height:${h}px}</style></head>
<body><img src="file://${svg}"></body></html>
HTML
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
      --default-background-color=00000000 --window-size="${w},${h}" \
      --screenshot="${out}" "file:///tmp/mnd_wrap.html" >/dev/null 2>&1
  else
    magick -background none "$svg" -resize "${w}x${h}" "$out" 2>/dev/null
  fi
}

echo "› Rendering app icon…"
render_svg "$ROOT/$A/icon.svg" "$ROOT/$A/icon_1024.png" 1024 1024
ICONSET="$A/Mandate.iconset"
mkdir -p "$ICONSET"
for spec in "16x16:16" "16x16@2x:32" "32x32:32" "32x32@2x:64" "128x128:128" "128x128@2x:256" "256x256:256" "256x256@2x:512" "512x512:512" "512x512@2x:1024"; do
  name="${spec%%:*}"; size="${spec##*:}"
  sips -z "$size" "$size" "$A/icon_1024.png" --out "$ICONSET/icon_$name.png" >/dev/null 2>&1
done
iconutil -c icns "$ICONSET" -o "$A/app.icns"

echo "› Rendering DMG backgrounds (retina 1x + 2x)…"
render_svg "$ROOT/$A/dmg-background.svg" "$ROOT/$A/background.png" 720 460
render_svg "$ROOT/$A/dmg-background.svg" "$ROOT/$A/background@2x.png" 1440 920

echo "✓ Assets regenerated in $A"
