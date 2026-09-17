#!/usr/bin/env bash
# Regenerate the action/store PNGs from the master SVG (ImageMagick).
set -euo pipefail
cd "$(dirname "$0")/.."
for s in 16 32 48 128; do
  magick public/icons/icon.svg -resize "${s}x${s}" "public/icons/icon-${s}.png"
done
echo "icons written to public/icons/"
