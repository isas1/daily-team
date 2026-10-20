#!/bin/sh
# Screenshots every artifact that has no PNG yet, with headless Chrome.
# Usage: sh shot.sh [days-dir]
set -eu
dir=${1:-days}
for c in "${CHROME:-}" google-chrome chromium chromium-browser \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  [ -n "$c" ] && command -v "$c" >/dev/null 2>&1 && chrome=$c && break
done
[ -n "${chrome:-}" ] || { echo "shot.sh: Chrome not found; set CHROME" >&2; exit 2; }
for f in "$dir"/*/artifact-*.html "$dir"/*/piece.html; do
  [ -e "$f" ] || continue
  png=${f%.html}.png
  [ -e "$png" ] && continue
  abs=$(cd "$(dirname "$f")" && pwd)/$(basename "$f")
  # Keep Chrome's sandbox on locally; Linux CI runners need it off. WebGL asks for the
  # SwiftShader software renderer; studio pages draw a 2D fallback where WebGL is missing.
  "$chrome" --headless=new ${CI:+--no-sandbox} --use-angle=swiftshader --hide-scrollbars \
    --window-size=1200,800 --virtual-time-budget=6000 --blink-settings=preferredColorScheme=1 --screenshot="$png" "file://$abs" >/dev/null 2>&1 \
    || echo "shot.sh: failed for $f" >&2
  if [ -e "$png" ]; then echo "$png"; fi
done
