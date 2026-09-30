#!/bin/sh
# Small copies of the event posters for the cards on the home feed and the
# calendar: <poster>-s.jpg, 720px on the long side. The originals stay as they
# are and are what opens full size. Run after adding a poster; existing copies
# are kept, so give a replaced poster a new file name (see CLAUDE.md).
cd "$(dirname "$0")/.." || exit 1
grep -o "img:'posters/[^']*'" index.html | sed "s/img:'//;s/'$//" | sort -u | while read -r src; do
  [ -f "$src" ] || { echo "missing $src"; continue; }
  out="${src%.*}-s.jpg"
  [ -f "$out" ] && continue
  sips -s format jpeg -s formatOptions 82 -Z 720 "$src" --out "$out" >/dev/null && echo "made $out"
done
