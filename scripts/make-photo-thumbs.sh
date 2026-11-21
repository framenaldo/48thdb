#!/bin/sh
# Small copies of the member photos for the places they are shown small (lists, chips, the home page, rota tiles):
# photos/s/<name>.jpg, 192px square, about 8 KB against the full photo's 50 KB. The page falls back to the full photo
# when a copy is missing (photoSm, imgFall in index.html), so run this after adding or replacing a photo, not before.
# Existing copies are kept; a replaced photo has a new file name anyway (see CLAUDE.md).
cd "$(dirname "$0")/.." || exit 1
mkdir -p photos/s
for src in photos/*.jpg; do
  out="photos/s/$(basename "$src")"
  [ -f "$out" ] && continue
  ffmpeg -y -loglevel error -i "$src" -vf "scale=192:192:force_original_aspect_ratio=increase:flags=lanczos,crop=192:192" -q:v 4 -map_metadata -1 "$out" && echo "made $out"
done
