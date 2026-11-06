#!/usr/bin/env bash
# Shared steps of scripts/demo.sh and scripts/demo-docker.sh. Sourced, not run.
# Needs base_url, admin_secret and cookie_jar set by the caller.

demo_lan_id=1
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
  curl -sf -c "$cookie_jar" -o /dev/null -X POST "$base_url/admin/api/login" \
    -H 'Content-Type: application/json' -d "{\"secret\":\"$admin_secret\"}" || return 1
  curl -sf -b "$cookie_jar" -o /dev/null -H 'Content-Type: application/json' "$@"
}

# prepare_demo_lan builds the room on a new demo, or keeps an old demo LAN running.
prepare_demo_lan() {
  local is_new="$1"
  if $is_new; then
    scripts/demo-room.sh areas "$base_url" "$admin_secret" || return 1
  else
    # A restart a day later would find the demo LAN over.
    local ends_at=$(($(date +%s) * 1000 + day_millis))
    admin_call -X PATCH "$base_url/admin/api/lans/$demo_lan_id" -d "{\"ends_at\":$ends_at}" ||
      echo "The demo LAN could not be extended. Start over with fresh data."
  fi
  admin_call -X PATCH "$base_url/admin/api/lans/$demo_lan_id/rules" \
    -d "{\"max_players\":$demo_max_players}" || echo "Could not raise max_players of the demo LAN."
}

# seat_demo_jellies creates the bots on a new demo, gives everyone a place and lets the bots play.
seat_demo_jellies() {
  local is_new="$1"
  # The bots come before the seats, so that they get places like everyone else.
  if $is_new; then
    admin_call -X POST "$base_url/admin/api/lans/$demo_lan_id/bots" -d "{\"count\":$demo_bots}" ||
      echo "Could not create the demo bots."
  fi
  scripts/demo-room.sh assign "$base_url" "$admin_secret"
  # A restart stops the bots of the server, so every start lets them play again.
  admin_call -X PUT "$base_url/admin/api/bots/auto" -d "{\"count\":$demo_bots}" ||
    echo "Could not start the demo bots."
}
