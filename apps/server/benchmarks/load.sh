#!/usr/bin/env bash
# Runs the simulator against a fresh local server and prints throughput, latency and server errors.
# Usage: benchmarks/load.sh [players] [min-delay] [max-delay] [seconds]
# Baselines and how to read them: benchmarks/README.md
set -u
cd "$(dirname "$0")/.."

players="${1:-70}"
min_delay="${2:-2s}"
max_delay="${3:-20s}"
seconds="${4:-30}"
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

echo "commit:   $(git rev-parse --short HEAD)$(git diff --quiet HEAD -- . || echo ' (dirty)')"
echo "load:     $players players, $min_delay to $max_delay between actions, ${seconds}s"
"$work_dir/jelly-server" simulate -url "http://$address" -players "$players" \
  -min-delay "$min_delay" -max-delay "$max_delay" -duration "${seconds}s" </dev/null 2>&1 |
  grep -E 'simulation ended|level=ERROR' | sed -E 's/^time=[^ ]+ //'
curl -s -o /dev/null -w 'state:    %{http_code} in %{time_total}s\n' \
  "http://$address/v1/stage?key=$JELLY_STAGE_KEY"

kill "$server_pid"
wait "$server_pid" 2>/dev/null
echo "database: $(du -h "$JELLY_DB" | cut -f1)"
echo "errors:   $(grep -c 'level=ERROR' "$work_dir/server.log")"
grep 'level=ERROR' "$work_dir/server.log" | sed -E 's/^time=[^ ]+ //' | sort | uniq -c | sort -rn | head -5
