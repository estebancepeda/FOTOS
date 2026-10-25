#!/usr/bin/env bash
# Pipeline completo: logos → hoja de contacto → cuadros → audio → MP4
# Uso: bash build.sh        (horizontal 1920×1080)
#      bash build.sh v      (vertical 1080×1920)
set -euo pipefail
cd "$(dirname "$0")"
export BUMPER_FORMAT="${1:-h}"
if [ "$BUMPER_FORMAT" = "v" ]; then SUF=_vertical; RES=1080x1920; else SUF=; RES=1920x1080; fi
OUT=../renders/bumper_mercedes_mayella_${RES}.mp4

df -h .. | tail -1
python3 extract_logos.py
python3 render.py stills 5 9 18 30 38 44 46 53 60 68 83 100
python3 contact_sheet.py
python3 render.py frames
python3 validate.py
python3 audio.py
ffmpeg -y -hide_banner -loglevel error -framerate 30 -i ../renders/frames${SUF}/f%03d.png \
  -i ../renders/bumper_audio.wav -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -tune grain -movflags +faststart \
  -c:a aac -b:a 256k -shortest "$OUT"
echo "ok $OUT"
