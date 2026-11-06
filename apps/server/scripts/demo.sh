#!/usr/bin/env bash
# Starts a demo server with room areas and simulated jellies, to look at the stage and the admin page.
# Usage: scripts/demo.sh [players] [address]    Ends with Ctrl+C. 0 players leaves only the bots.
# The data stays in .demo/ or in JELLY_DEMO_DIR, so accounts, LANs and settings survive a restart.
# Remove that folder to start over.
set -u
cd "$(dirname "$0")/.."

players="${1:-70}"
address="${2:-127.0.0.1:18092}"
base_url="http://$address"
data_dir="${JELLY_DEMO_DIR:-.demo}"
lan_id=1
# Every start adds new simulated jellies, so the demo LAN needs room for many runs.
demo_max_players=1000
# Bots of the server play next to the simulated jellies, which shows them and builds stacks.
demo_bots=10
day_millis=86400000

# GNU date takes -d, BSD date on macOS takes -v.
utc_at() {
  date -u -d "$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v"$2" +%Y-%m-%dT%H:%M:%SZ
}

# admin_call sends an admin request with a fresh session.
admin_call() {
  local jar="$work_dir/cookies"
  curl -sf -c "$jar" -o /dev/null -X POST "$base_url/admin/api/login" \
    -H 'Content-Type: application/json' -d "{\"secret\":\"$JELLY_ADMIN_SECRET\"}" || return 1
  curl -sf -b "$jar" -o /dev/null -H 'Content-Type: application/json' "$@"
}

work_dir="$(mktemp -d)"
go generate ./internal/web || exit 2
go build -o "$work_dir/jelly-server" ./cmd/jelly-server || exit 2

mkdir -p "$data_dir"
export JELLY_DB="$data_dir/jelly.db" JELLY_ADDR="$address"
export JELLY_STAGE_KEY=demo-stage JELLY_ADMIN_SECRET=demo-admin JELLY_JOIN_CODE=demo-code

is_new=false
if [ ! -f "$JELLY_DB" ]; then
  is_new=true
  "$work_dir/jelly-server" create-lan -slug demo -name Demo \
    "-from=$(utc_at '1 hour ago' -1H)" "-to=$(utc_at '1 day' +1d)" 2>/dev/null || exit 2
fi

"$work_dir/jelly-server" </dev/null >"$data_dir/server.log" 2>&1 &
server_pid=$!
trap 'kill $server_pid $simulator_pid 2>/dev/null; rm -rf "$work_dir"' EXIT
simulator_pid=""
sleep 1

if $is_new; then
  scripts/demo-room.sh areas "$base_url" "$JELLY_ADMIN_SECRET" || exit 2
else
  # A restart a day later would find the demo LAN over.
  ends_at=$(( $(date +%s) * 1000 + day_millis ))
  admin_call -X PATCH "$base_url/admin/api/lans/$lan_id" -d "{\"ends_at\":$ends_at}" ||
    echo "The demo LAN could not be extended. Remove $data_dir to start over."
fi
admin_call -X PATCH "$base_url/admin/api/lans/$lan_id/rules" \
  -d "{\"max_players\":$demo_max_players}" || echo "Could not raise max_players of the demo LAN."

# Without -run-id every start picks new names, because the old ones are taken. With 0 players only
# the bots of the server play.
if [ "$players" -gt 0 ]; then
  "$work_dir/jelly-server" simulate -url "$base_url" -players "$players" \
    -min-delay 5s -max-delay 30s -duration 24h </dev/null >"$data_dir/simulator.log" 2>&1 &
  simulator_pid=$!
  sleep 3
fi

# The bots come before the seats, so that they get places like everyone else.
if $is_new; then
  admin_call -X POST "$base_url/admin/api/lans/$lan_id/bots" -d "{\"count\":$demo_bots}" ||
    echo "Could not create the demo bots."
fi
scripts/demo-room.sh assign "$base_url" "$JELLY_ADMIN_SECRET"
# A restart stops the bots of the server, so every start lets them play again.
admin_call -X PUT "$base_url/admin/api/bots/auto" -d "{\"count\":$demo_bots}" ||
  echo "Could not start the demo bots."

echo "Stage: $base_url/stage/?key=$JELLY_STAGE_KEY"
echo "Admin: $base_url/admin/ (password: $JELLY_ADMIN_SECRET)"
echo "Data:  $data_dir, remove it to start over"
echo "Stop with Ctrl+C."
wait "$server_pid"
