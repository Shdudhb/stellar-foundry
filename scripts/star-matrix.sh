#!/bin/bash
# Plays the whole game under several star settings with each of the bot's four styles, four games at a time,
# and prints who reached the stargate. About half an hour on four cores.
#   bash scripts/star-matrix.sh [output-dir]
# The bot is deterministic but brittle (see STYLE in playthrough.ts): read a setting as playable when any style
# finishes it, and a stall as the bot's until --item shows otherwise.
OUT="${1:-/tmp/star-matrix}"
mkdir -p "$OUT"
cd "$(dirname "$0")/.." || exit 1
run() {
  for st in 0 1 2 3; do
    npx vite-node scripts/playthrough.ts -- --style=$st $2 > "$OUT/$1_$st.log" 2>&1 &
  done
  wait
  for st in 0 1 2 3; do
    echo "$1 style $st: $(grep -A1 '全流程結果' "$OUT/$1_$st.log" | tail -1) $(grep -o '停在.*' "$OUT/$1_$st.log")"
  done
}
run first ""
run black_hole "--star=black_hole"
run black_hole_poor "--star=black_hole --rich=0.7"
run poor "--star=yellow_dwarf --rich=0.7"
run blue_giant_rich "--star=blue_giant --rich=1.5"
run red_dwarf "--star=red_dwarf --rich=0.85"
