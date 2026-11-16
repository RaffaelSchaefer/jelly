#!/usr/bin/env bash
# Runs the simulator against a fresh local server and prints throughput, latency and server errors.
# Usage: benchmarks/load.sh [players] [min-delay] [max-delay] [seconds] [stages] [streams]
# stages is the number of stage screens. streams "on" lets every jelly keep an event stream open as
# the app with its map does, "events" only with events as the app without its map would.
# Baselines and how to read them: benchmarks/README.md
set -u
cd "$(dirname "$0")/.."

players="${1:-70}"
min_delay="${2:-2s}"
max_delay="${3:-20s}"
seconds="${4:-30}"
stages="${5:-0}"
streams="${6:-off}"
address="127.0.0.1:18091"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
go build -o "$work_dir/jelly-server" ./cmd/jelly-server || exit 2

export JELLY_DB="$work_dir/jelly.db" JELLY_ADDR="$address"
export JELLY_STAGE_KEY=bench-stage JELLY_ADMIN_SECRET=bench-admin JELLY_JOIN_CODE=bench-code

"$work_dir/jelly-server" create-lan -slug bench -name Bench \
  "-from=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" \
  "-to=$(date -u -d '1 day' +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null || exit 2

"$work_dir/jelly-server" </dev/null >"$work_dir/server.log" 2>&1 &
server_pid=$!
sleep 1

# The defaults allow 120 players and 200 streams. A large run raises both, as the organizers would.
cookie_jar="$work_dir/cookies"
player_streams=0
[ "$streams" != off ] && player_streams="$players"
streams_needed=$(( stages + player_streams + 10 ))
curl -sf -c "$cookie_jar" -o /dev/null -X POST "http://$address/admin/api/login" \
  -H 'Content-Type: application/json' -d "{\"secret\":\"$JELLY_ADMIN_SECRET\"}" || exit 2
curl -sf -b "$cookie_jar" -o /dev/null -X PATCH "http://$address/admin/api/lans/1/rules" \
  -H 'Content-Type: application/json' \
  -d "{\"max_players\":$(( players > 120 ? players : 120 )),\"max_streams\":$(( streams_needed > 200 ? streams_needed : 200 ))}" || exit 2

echo "commit:   $(git rev-parse --short HEAD)$(git diff --quiet HEAD -- . || echo ' (dirty)')"
echo "load:     $players players, $min_delay to $max_delay between actions, ${seconds}s"
echo "streams:  $stages stages, player streams $streams"
cpu_before="$(awk '{print $14 + $15}' "/proc/$server_pid/stat")"
"$work_dir/jelly-server" simulate -url "http://$address" -players "$players" \
  -min-delay "$min_delay" -max-delay "$max_delay" -duration "${seconds}s" \
  -stages "$stages" "-streams=$([ "$streams" != off ] && echo true || echo false)" \
  -stream-topics "$([ "$streams" = events ] && echo events)" </dev/null 2>&1 |
  grep -E 'simulation ended|level=ERROR' | sed -E 's/^time=[^ ]+ //'
curl -s -o /dev/null -w 'state:    %{http_code} in %{time_total}s\n' \
  "http://$address/v1/stage?key=$JELLY_STAGE_KEY"

# CPU time of the server during the run, in clock ticks, and the most memory it held.
cpu_after="$(awk '{print $14 + $15}' "/proc/$server_pid/stat")"
ticks="$(getconf CLK_TCK)"
echo "cpu:      $(( (cpu_after - cpu_before) * 100 / ticks / seconds ))% of one core on average"
echo "memory:   $(awk '/VmHWM/ {print $2 " " $3}' "/proc/$server_pid/status") at most"
kill "$server_pid"
wait "$server_pid" 2>/dev/null
echo "database: $(du -h "$JELLY_DB" | cut -f1)"
echo "errors:   $(grep -c 'level=ERROR' "$work_dir/server.log")"
grep 'level=ERROR' "$work_dir/server.log" | sed -E 's/^time=[^ ]+ //' | sort | uniq -c | sort -rn | head -5
