#!/usr/bin/env bash
# Starts the Docker demo, lets the first rush pass and records the stage as MP4 and GIF.
# Usage: scripts/record-demo.sh <out-dir> [seconds]    The demo keeps running afterwards.
set -u
cd "$(dirname "$0")/.."

out_dir="${1:?Usage: scripts/record-demo.sh <out-dir> [seconds]}"
seconds="${2:-20}"
stage_url="http://127.0.0.1:${JELLY_DEMO_PORT:-18092}/stage/?key=demo-stage"
rush_seconds=25
gif_width=800
gif_rate=12

mkdir -p "$out_dir"
scripts/demo-docker.sh start >/dev/null || exit 2
sleep "$rush_seconds"
node scripts/record-stage.mjs "$stage_url" "$out_dir/stage.webm" "$seconds" || exit 2
ffmpeg -y -v error -i "$out_dir/stage.webm" -c:v libx264 -pix_fmt yuv420p -crf 23 -r 30 \
  -movflags +faststart "$out_dir/stage.mp4" || exit 2
# A palette made for this video keeps the colors of the jellies clean in the GIF.
ffmpeg -y -v error -i "$out_dir/stage.webm" -filter_complex \
  "fps=$gif_rate,scale=$gif_width:-1:flags=lanczos,split[first][second];[first]palettegen=max_colors=128[palette];[second][palette]paletteuse=dither=bayer:bayer_scale=4" \
  "$out_dir/stage.gif" || exit 2
rm "$out_dir/stage.webm"
ls -la "$out_dir"
echo "Stage: $stage_url"
