#!/usr/bin/env bash
# Runs the demo from the real image, reachable only on this machine, like scripts/demo.sh.
# Usage: scripts/demo-docker.sh start [players] | stop | reset
# JELLY_DEMO_BIND=0.0.0.0 opens the demo to the local network, to try the admin page on a phone.
# 0 players leaves only the bots of the server. The data stays in a volume, so `stop` and `start`
# keep accounts, LANs and settings. `reset` removes them.
set -u
cd "$(dirname "$0")/.."
source scripts/demo-common.sh

image="jelly-server:demo"
server="jelly-demo"
simulator="jelly-demo-simulator"
volume="jelly-demo-data"
# The same address as scripts/demo.sh, so a client built for the demo finds both.
port="${JELLY_DEMO_PORT:-18092}"
bind="${JELLY_DEMO_BIND:-127.0.0.1}"
base_url="http://127.0.0.1:$port"
# Browsers keep the Secure admin cookie only on localhost, so a demo in the network needs plain HTTP.
http_demo=0
[ "$bind" = "127.0.0.1" ] || http_demo=1
stage_key="demo-stage"
admin_secret="demo-admin"
join_code="demo-code"
health_tries=30

stop_demo() {
  # The old name of the simulator container stays here, so that old demos stop as well.
  docker rm -f "$simulator" jelly-demo-bots "$server" >/dev/null 2>&1
}

start_demo() {
  local players="$1" is_new=false
  stop_demo
  docker build -q -f Dockerfile -t "$image" ../.. >/dev/null || exit 2
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    is_new=true
    docker volume create "$volume" >/dev/null || exit 2
    docker run --rm -v "$volume:/app/data" -e "JELLY_JOIN_CODE=$join_code" "$image" create-lan \
      -slug demo -name Demo "-from=$(utc_at '1 hour ago' -1H)" \
      "-to=$(utc_at '1 day' +1d)" 2>/dev/null || exit 2
  fi
  docker run -d --name "$server" -p "$bind:$port:8080" -v "$volume:/app/data" \
    -e "JELLY_STAGE_KEY=$stage_key" -e "JELLY_ADMIN_SECRET=$admin_secret" \
    -e "JELLY_HTTP_DEMO=$http_demo" "$image" >/dev/null || exit 2
  for _ in $(seq 1 "$health_tries"); do
    curl -sf "$base_url/health" >/dev/null && break
    sleep 1
  done
  cookie_jar="$(mktemp)"
  trap 'rm -f "$cookie_jar"' EXIT
  prepare_demo_lan "$is_new" || exit 2
  # The simulator shares the network of the server, so the demo needs no extra network. Without
  # -run-id every start picks new names, because the old ones are taken.
  if [ "$players" -gt 0 ]; then
    docker run -d --name "$simulator" --network "container:$server" \
      -e "JELLY_JOIN_CODE=$join_code" "$image" simulate -url http://127.0.0.1:8080 \
      -players "$players" -min-delay 5s -max-delay 30s -duration 24h >/dev/null || exit 2
    sleep 5
  fi
  seat_demo_jellies "$is_new"
  echo "Stage: $base_url/stage/?key=$stage_key"
  echo "Admin: $base_url/admin/ (password: $admin_secret)"
  if [ "$bind" != "127.0.0.1" ]; then
    echo "Open to the network: use the address of this machine instead of 127.0.0.1."
  fi
  echo "Stop with: scripts/demo-docker.sh stop, start over with: scripts/demo-docker.sh reset"
}

case "${1:-}" in
  start) start_demo "${2:-70}" ;;
  stop) stop_demo ;;
  reset)
    stop_demo
    docker volume rm "$volume" >/dev/null 2>&1
    ;;
  *)
    echo "Usage: $0 start [players] | stop | reset"
    exit 2
    ;;
esac
