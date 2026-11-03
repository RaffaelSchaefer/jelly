#!/usr/bin/env bash
# Runs the demo from the real image, reachable only on this machine.
# Usage: scripts/demo-docker.sh start [players] | stop
set -u
cd "$(dirname "$0")/.."

image="jelly-server:demo"
server="jelly-demo"
bots="jelly-demo-bots"
volume="jelly-demo-data"
port="18093"
base_url="http://127.0.0.1:$port"
stage_key="demo-stage"
admin_secret="demo-admin"
join_code="demo-code"
health_tries=30

stop_demo() {
  docker rm -f "$bots" "$server" >/dev/null 2>&1
  docker volume rm "$volume" >/dev/null 2>&1
}

start_demo() {
  local players="$1"
  stop_demo
  docker build -q -f Dockerfile -t "$image" ../.. >/dev/null || exit 2
  docker volume create "$volume" >/dev/null || exit 2
  docker run --rm -v "$volume:/app/data" -e "JELLY_JOIN_CODE=$join_code" "$image" create-lan \
    -slug demo -name Demo "-from=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" \
    "-to=$(date -u -d '1 day' +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null || exit 2
  docker run -d --name "$server" -p "127.0.0.1:$port:8080" -v "$volume:/app/data" \
    -e "JELLY_STAGE_KEY=$stage_key" -e "JELLY_ADMIN_SECRET=$admin_secret" "$image" >/dev/null || exit 2
  for _ in $(seq 1 "$health_tries"); do
    curl -sf "$base_url/health" >/dev/null && break
    sleep 1
  done
  scripts/demo-room.sh areas "$base_url" "$admin_secret" || exit 2
  # The bots share the network of the server, so the demo needs no extra network.
  docker run -d --name "$bots" --network "container:$server" -e "JELLY_JOIN_CODE=$join_code" \
    "$image" simulate -url http://127.0.0.1:8080 -players "$players" \
    -run-id d -min-delay 5s -max-delay 30s -duration 24h >/dev/null || exit 2
  sleep 5
  scripts/demo-room.sh assign "$base_url" "$admin_secret"
  echo "Stage: $base_url/stage/?key=$stage_key"
  echo "Stop with: scripts/demo-docker.sh stop"
}

case "${1:-}" in
  start) start_demo "${2:-70}" ;;
  stop) stop_demo ;;
  *) echo "Usage: $0 start [players] | stop"; exit 2 ;;
esac
