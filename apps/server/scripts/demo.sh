#!/usr/bin/env bash
# Starts a throwaway server with room areas and simulated jellies, to look at the stage.
# Usage: scripts/demo.sh [players] [address]    Ends with Ctrl+C and leaves nothing behind.
set -u
cd "$(dirname "$0")/.."

players="${1:-70}"
address="${2:-127.0.0.1:18092}"
base_url="http://$address"

# GNU date takes -d, BSD date on macOS takes -v.
utc_at() {
  date -u -d "$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v"$2" +%Y-%m-%dT%H:%M:%SZ
}

work_dir="$(mktemp -d)"
go generate ./internal/web || exit 2
go build -o "$work_dir/jelly-server" ./cmd/jelly-server || exit 2

export JELLY_DB="$work_dir/jelly.db" JELLY_ADDR="$address"
export JELLY_STAGE_KEY=demo-stage JELLY_ADMIN_SECRET=demo-admin JELLY_JOIN_CODE=demo-code

"$work_dir/jelly-server" create-lan -slug demo -name Demo \
  "-from=$(utc_at '1 hour ago' -1H)" "-to=$(utc_at '1 day' +1d)" 2>/dev/null || exit 2

"$work_dir/jelly-server" </dev/null >"$work_dir/server.log" 2>&1 &
server_pid=$!
trap 'kill $server_pid $simulator_pid 2>/dev/null; rm -rf "$work_dir"' EXIT
simulator_pid=""
sleep 1

scripts/demo-room.sh areas "$base_url" "$JELLY_ADMIN_SECRET" || exit 2

"$work_dir/jelly-server" simulate -url "$base_url" -players "$players" \
  -run-id d -min-delay 5s -max-delay 30s -duration 24h </dev/null >"$work_dir/simulator.log" 2>&1 &
simulator_pid=$!
sleep 3

scripts/demo-room.sh assign "$base_url" "$JELLY_ADMIN_SECRET"

echo "Stage: $base_url/stage/?key=$JELLY_STAGE_KEY"
echo "Stop with Ctrl+C."
wait "$server_pid"
