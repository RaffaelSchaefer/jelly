#!/usr/bin/env bash
# Starts a throwaway server with room areas and simulated jellies, to look at the stage.
# Usage: scripts/demo.sh [players] [address]    Ends with Ctrl+C and leaves nothing behind.
set -u
cd "$(dirname "$0")/.."

players="${1:-70}"
address="${2:-127.0.0.1:18092}"
base_url="http://$address"
lan_id=1

work_dir="$(mktemp -d)"
go generate ./internal/web || exit 2
go build -o "$work_dir/jelly-server" ./cmd/jelly-server || exit 2

export JELLY_DB="$work_dir/jelly.db" JELLY_ADDR="$address"
export JELLY_STAGE_KEY=demo-stage JELLY_ADMIN_SECRET=demo-admin JELLY_JOIN_CODE=demo-code

"$work_dir/jelly-server" create-lan -slug demo -name Demo \
  "-from=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" \
  "-to=$(date -u -d '1 day' +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null || exit 2

"$work_dir/jelly-server" </dev/null >"$work_dir/server.log" 2>&1 &
server_pid=$!
trap 'kill $server_pid $simulator_pid 2>/dev/null; rm -rf "$work_dir"' EXIT
simulator_pid=""
sleep 1

# admin_call sends an admin request with the session cookie of the login below.
admin_call() {
  curl -sf -b "$cookie" -H 'Content-Type: application/json' "$@"
}

cookie="$(curl -si -X POST "$base_url/admin/api/login" -H 'Content-Type: application/json' \
  -d "{\"secret\":\"$JELLY_ADMIN_SECRET\"}" | sed -n 's/^[Ss]et-[Cc]ookie: \([^;]*\).*/\1/p')"

# Roughly a hall with two long rows, a side table and a corner, as a seat plan would give it.
for area in '{"x":5,"y":10,"width":40,"height":35}' '{"x":55,"y":10,"width":40,"height":35}' \
  '{"x":5,"y":55,"width":55,"height":40}' '{"x":70,"y":60,"width":25,"height":35}'; do
  admin_call -X POST "$base_url/admin/api/lans/$lan_id/areas" -d "$area" >/dev/null || exit 2
done

"$work_dir/jelly-server" simulate -url "$base_url" -players "$players" \
  -min-delay 2s -max-delay 12s -duration 24h </dev/null >"$work_dir/simulator.log" 2>&1 &
simulator_pid=$!
sleep 3

area_ids="$(admin_call "$base_url/admin/api/lans/$lan_id/areas" |
  grep -o '"areas":\[[^]]*\]' | grep -o '"id":[0-9]*' | cut -d: -f2)"
mapfile -t areas <<<"$area_ids"
position=0
for player_id in $(admin_call "$base_url/admin/api/players" | grep -o '"id":[0-9]*' | cut -d: -f2); do
  area_id="${areas[$((position % ${#areas[@]}))]}"
  admin_call -X PUT "$base_url/admin/api/lans/$lan_id/players/$player_id/area" \
    -d "{\"area_id\":$area_id}" >/dev/null
  position=$((position + 1))
done

echo "Stage: $base_url/stage/?key=$JELLY_STAGE_KEY"
echo "Stop with Ctrl+C."
wait "$server_pid"
