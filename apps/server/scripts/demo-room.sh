#!/usr/bin/env bash
# Sets up the room of a demo server like the hall of the LAN. At the back is the stage with two
# beamers, in front of it the chillout lounge on the left and the snack bar on the right. Then a
# spine of desks runs down the middle with rows of desks on each side and aisles between them. Most
# rows come in threes: gaming desks, a desk row for the network gear, gaming desks again. Each
# player of a gaming desk stands in the aisle in front of it, and a group is one row of gaming
# desks in one half. Desks are tables of 1 by 0.5 meters in the default hall of 22 by 16.1 meters.
# Usage: scripts/demo-room.sh areas|assign <base-url> <admin-secret>
set -u

step="$1"
base_url="$2"
admin_secret="$3"
lan_id=1
visitor_every=6

# The admin API takes percent of the stage. Desks, seats and the spine are planned in meters of the
# hall, as the default rules of a LAN describe it.
stage_size=100
hall_width=22
hall_depth=16.1
# A desk is a table. The players of gaming desks stand on the floor in front of them.
desk_width=1
desk_depth=0.5
seat_depth=0.75
# Columns in meters from the left: a margin, eight desks, the spine, eight desks, a margin.
left_half_x=2.5
right_half_x=11.5
spine_x=10.5
# The spine is a stack of desks from the back to the front of the rows.
spine_top=3.6
spine_desks=20

# calc prints the value of an awk expression, because bash has no decimals.
calc() {
  LC_ALL=C awk "BEGIN { print $* }"
}

# to_percent x y width height prints a rectangle in meters of the hall in percent of the stage. Each
# value may be an expression like "2.5 + 3 * 1".
to_percent() {
  calc "($1) * $stage_size / $hall_width, ($2) * $stage_size / $hall_depth," \
    "($3) * $stage_size / $hall_width, ($4) * $stage_size / $hall_depth"
}

# The front of the hall as x y width height kind blocks prop [rotation]: the stage platform with what
# stands on it as its own obstacles, the lounge, the snack bar counter with its queue, and a desk
# turned by 30 degrees next to the lounge, to compare the model with the obstacle.
front_zones=(
  "5 1 90 8 stage false stage-platform"
  "22 1.75 20 0.5 none true screen"
  "58 1.75 20 0.5 none true screen"
  "7.86 1.5 4.76 2 none true speaker"
  "87.38 1.5 4.76 2 none true speaker"
  "48.33 1.63 3.33 1.75 none true pedestal"
  "5 12 40 10 lounge false lounge-set"
  "65 14 20 3 none true snack-bar-set"
  "50 17 45 5 queue false"
  "$(to_percent 11.2 1.9 "$desk_width" "$desk_depth") none true desk 30"
  "5 95.5 90 4 visitors false"
)

# Rows from the back of the hall to the front: top edge in meters, left half, right half, and the
# side the players of the gaming desks stand on. D is a desk, G a gaming desk for one player.
rows=(
  "4.1 DDDDDDDD DDDDDDDD none"
  "4.6 GGGGGGGG GGGGGGGG below"
  "6.6 GGGGGGGG GGGGGGGG above"
  "7.1 DDDDDDDD DDDDDDDD none"
  "7.6 GGGGGGGG GGGGGGGG below"
  "9.6 GGGGGGGG GGGGGGGG above"
  "10.1 DDDDDDDD DDDDDDDD none"
  "10.6 GGGGGGGG GGGGGGGG below"
  "12.6 GGGGGGGG GGGGGGGG above"
  "13.1 DDDDGGGG GGGGDDDD below"
)

cookie="$(curl -si -X POST "$base_url/admin/api/login" -H 'Content-Type: application/json' \
  -d "{\"secret\":\"$admin_secret\"}" | sed -n 's/^[Ss]et-[Cc]ookie: \([^;]*\).*/\1/p')"

admin_call() {
  curl -sf -b "$cookie" -H 'Content-Type: application/json' "$@"
}

# create_area x y width height kind [blocks] [prop] [rotation]
create_area() {
  admin_call -X POST "$base_url/admin/api/lans/$lan_id/areas" \
    -d "{\"x\":$1,\"y\":$2,\"width\":$3,\"height\":$4,\"kind\":\"$5\",\"blocks\":${6:-false},\"prop\":\"${7:-}\",\"rotation\":${8:-0}}" \
    >/dev/null || exit 2
}

# list_runs <pattern> <letter> prints "start length" for every run of the letter in the pattern.
list_runs() {
  local pattern="$1" letter="$2" index start=-1
  for ((index = 0; index <= ${#pattern}; index++)); do
    if [ "${pattern:index:1}" = "$letter" ]; then
      [ "$start" -lt 0 ] && start=$index
    elif [ "$start" -ge 0 ]; then
      echo "$start $((index - start))"
      start=-1
    fi
  done
}

# create_half_seats <row top> <half x> <pattern> <side> adds the floor in front of each run of
# gaming desks, where the group of that run stands.
create_half_seats() {
  local top="$1" half_x="$2" pattern="$3" side="$4" start length seats_y
  [ "$side" = none ] && return
  seats_y="$top + $desk_depth"
  [ "$side" = above ] && seats_y="$top - $seat_depth"
  while read -r start length; do
    # shellcheck disable=SC2046 # The rectangle is split into its fields on purpose.
    create_area $(to_percent "$half_x + $start * $desk_width" "$seats_y" \
      "$length * $desk_width" "$seat_depth") seats
  done < <(list_runs "$pattern" G)
}

# create_half_desks <row top> <half x> <pattern> adds one desk per cell. All desks of the hall have
# the same size, a gaming desk is just a desk with a player in front of it.
create_half_desks() {
  local top="$1" half_x="$2" pattern="$3" place
  for ((place = 0; place < ${#pattern}; place++)); do
    # shellcheck disable=SC2046 # The rectangle is split into its fields on purpose.
    create_area $(to_percent "$half_x + $place * $desk_width" "$top" "$desk_width" "$desk_depth") \
      none true desk
  done
}

create_areas() {
  local row top left right side
  for row in "${rows[@]}"; do
    read -r top left right side <<<"$row"
    create_half_seats "$top" "$left_half_x" "$left" "$side"
    create_half_seats "$top" "$right_half_x" "$right" "$side"
  done
  for row in "${rows[@]}"; do
    read -r top left right side <<<"$row"
    create_half_desks "$top" "$left_half_x" "$left"
    create_half_desks "$top" "$right_half_x" "$right"
  done
  # The spine is a stack of the same desks, from the back to the front.
  local spine_desk
  for ((spine_desk = 0; spine_desk < spine_desks; spine_desk++)); do
    # shellcheck disable=SC2046 # The rectangle is split into its fields on purpose.
    create_area $(to_percent "$spine_x" "$spine_top + $spine_desk * $desk_depth" "$desk_width" \
      "$desk_depth") none true desk
  done
  local zone
  for zone in "${front_zones[@]}"; do
    # shellcheck disable=SC2086 # The zone is split into its fields on purpose.
    create_area $zone
  done
}

# Deals all registered jellies to the places in turn, so a group gets one jelly per gaming desk.
assign_players() {
  local position=0 player_id area_id width desks place
  local -a places
  while read -r area_id width; do
    desks=$(calc "int($width * $hall_width / $stage_size / $desk_width + 0.5)")
    for ((place = 0; place < desks; place++)); do
      places+=("$area_id")
    done
  done < <(admin_call "$base_url/admin/api/lans/$lan_id/areas" |
    grep -o '"areas":\[[^]]*\]' | grep -o '"id":[0-9]*[^}]*"kind":"seats"' |
    sed 's/"id":\([0-9]*\).*"width":\([0-9.]*\).*/\1 \2/')
  for player_id in $(admin_call "$base_url/admin/api/players" | grep -o '"id":[0-9]*' | cut -d: -f2); do
    position=$((position + 1))
    # Every sixth jelly has no place of its own and wanders through the visitor zone.
    if ((position % visitor_every == 0)); then
      continue
    fi
    area_id="${places[$((position % ${#places[@]}))]}"
    admin_call -X PUT "$base_url/admin/api/lans/$lan_id/players/$player_id/area" \
      -d "{\"area_id\":$area_id}" >/dev/null
  done
}

case "$step" in
  areas) create_areas ;;
  assign) assign_players ;;
  *) echo "Unknown step: $step"; exit 2 ;;
esac
