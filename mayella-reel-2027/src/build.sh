#!/usr/bin/env bash
# Render completo del reel en bloques paralelos → MP4 vertical con el audio original.
# Uso: bash build.sh [procesos=4] [submuestras motion blur=3]
set -euo pipefail
cd "$(dirname "$0")"
N=${1:-4}; SUB=${2:-3}
DUR=$(grep -oP "export const DURATION = \K[0-9.]+" story.js)
FRAMES=$(python3 -c "print(round($DUR*30))")
OUT=../renders/reel_mercedes_2027_mayella_1080x1920.mp4
mkdir -p ../renders/parts
df -h .. | tail -1
STEP=$(( (FRAMES + N - 1) / N ))
for ((k=0; k<N; k++)); do
  F0=$((k*STEP)); F1=$(( (k+1)*STEP < FRAMES ? (k+1)*STEP : FRAMES ))
  node render.mjs part story $F0 $F1 ../renders/parts/p$k.mp4 $SUB > ../renders/parts/p$k.log 2>&1 &
done
wait
: > ../renders/parts/list.txt
for ((k=0; k<N; k++)); do grep -q "^ok" ../renders/parts/p$k.log || { echo "falló el bloque $k"; tail ../renders/parts/p$k.log; exit 1; }; echo "file 'p$k.mp4'" >> ../renders/parts/list.txt; done
# une los bloques sin recomprimir y añade el audio (con silencio al final para el reposo del logo)
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i ../renders/parts/list.txt \
  -i ../assets/audio/AUDIO_MERCEDES_MAYELLA.mp3 -map 0:v -map 1:a -c:v copy \
  -af "apad" -c:a aac -b:a 320k -t "$DUR" -movflags +faststart "$OUT"
echo "ok $OUT"
