#!/usr/bin/env bash
# Starts a demo server with room areas and simulated jellies, to look at the stage and the admin page.
# Usage: scripts/demo.sh [players] [address]    Ends with Ctrl+C. 0 players leaves only the bots.
# The data stays in .demo/ or in JELLY_DEMO_DIR, so accounts, LANs and settings survive a restart.
# Remove that folder to start over. scripts/demo-docker.sh does the same from the real image.
set -u
cd "$(dirname "$0")/.."
source scripts/demo-common.sh

players="${1:-70}"
address="${2:-127.0.0.1:18092}"
base_url="http://$address"
data_dir="${JELLY_DEMO_DIR:-.demo}"
admin_secret=demo-admin

work_dir="$(mktemp -d)"
cookie_jar="$work_dir/cookies"
go generate ./internal/web || exit 2
go build -o "$work_dir/jelly-server" ./cmd/jelly-server || exit 2

mkdir -p "$data_dir"
export JELLY_DB="$data_dir/jelly.db" JELLY_ADDR="$address"
export JELLY_STAGE_KEY=demo-stage JELLY_ADMIN_SECRET="$admin_secret" JELLY_JOIN_CODE=demo-code

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

prepare_demo_lan "$is_new" || exit 2

# Without -run-id every start picks new names, because the old ones are taken. With 0 players only
# the bots of the server play.
if [ "$players" -gt 0 ]; then
  "$work_dir/jelly-server" simulate -url "$base_url" -players "$players" \
    -min-delay 5s -max-delay 30s -duration 24h </dev/null >"$data_dir/simulator.log" 2>&1 &
  simulator_pid=$!
  sleep 3
fi

seat_demo_jellies "$is_new"

echo "Stage: $base_url/stage/?key=$JELLY_STAGE_KEY"
echo "Admin: $base_url/admin/ (password: $admin_secret)"
echo "Data:  $data_dir, remove it to start over"
echo "Stop with Ctrl+C."
wait "$server_pid"
