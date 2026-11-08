#!/usr/bin/env bash
# Sets up the room of a demo server like the hall of the LAN. At the back is the stage with two
# beamers, in front of it the chillout lounge on the left and the snack bar on the right. Then a
# spine of desks runs down the middle with rows of desks on each side and aisles between them. Most
# rows come in threes: gaming desks, a desk row for the network gear, gaming desks again. Each
# player of a gaming desk stands in the aisle in front of it, and a group is one row of gaming
# desks in one half. Every desk is a table of 1 by 0.5 meters, and two rows of gaming desks facing
# each other leave the floor of three desks between them.
# Usage: scripts/demo-room.sh areas|assign <base-url> <admin-secret>
set -u

step="$1"
base_url="$2"
admin_secret="$3"
lan_id=1
visitor_every=6

# The plan is in meters. The admin API takes percent of the stage, so create_area converts it, and
# the LAN gets the size of the hall.
hall_width=10
hall_depth=20.5
stage_size=100
desk_width=1
desk_depth=0.5
# The floor in front of a row of gaming desks, where its players stand.
seat_depth=0.75
# Columns from the left: a margin, four desks, the spine, four desks, a margin.
left_half_x=0.5
right_half_x=5.5
spine_x=4.5
# The spine is a stack of desks from just behind the first row to the end of the last one.
spine_top=5.5
spine_desks=26
# The front of the hall as x y width height kind blocks prop [rotation]: the stage platform with what
# stands on it as its own obstacles, the lounge, the snack bar counter with its queue, a desk turned
# by 30 degrees next to the lounge, to compare the model with the obstacle, and the visitor zone.
front_zones=(
  "0.5 0.25 9 2 stage false stage-platform"
  "2.2 0.44 2 0.12 none true screen"
  "5.8 0.44 2 0.12 none true screen"
  "0.79 0.38 0.48 0.5 none true speaker"
  "8.73 0.38 0.48 0.5 none true speaker"
  "4.83 0.41 0.34 0.44 none true pedestal"
  "0.5 3 4 2.5 lounge false lounge-set"
  "6.5 3.5 2 0.75 none true snack-bar-set"
  "5 4.25 4.5 1.25 queue false"
  "4.8 3.1 1 0.5 none true desk 30"
  "0.5 19.4 9 1 visitors false"
)

# Rows from the back of the hall to the front: top edge, left half, right half, and the side the
# players of the gaming desks stand on. D is a desk, G a gaming desk for one player.
rows=(
  "6 DDDD DDDD none"
  "6.5 GGGG GGGG below"
  "8.5 GGGG GGGG above"
  "9 DDDD DDDD none"
  "9.5 GGGG GGGG below"
  "11.5 GGGG GGGG above"
  "12 DDDD DDDD none"
  "12.5 GGGG GGGG below"
  "14.5 GGGG GGGG above"
  "15 DDDD DDDD none"
  "15.5 GGGG GGGG below"
  "17.5 GGGG GGGG above"
  "18 DDGG GGDD below"
)

cookie="$(curl -si -X POST "$base_url/admin/api/login" -H 'Content-Type: application/json' \
  -d "{\"secret\":\"$admin_secret\"}" | sed -n 's/^[Ss]et-[Cc]ookie: \([^;]*\).*/\1/p')"

admin_call() {
  curl -sf -b "$cookie" -H 'Content-Type: application/json' "$@"
}

# calc prints the values of awk expressions, because bash has no decimals.
calc() {
  LC_ALL=C awk "BEGIN { print $* }"
}

# create_area x y width height kind [blocks] [prop] [rotation] takes meters, each a number or a sum
# like "0.5 + 2 * 1", and creates the area in percent of the stage.
create_area() {
  local x y width height
  read -r x y width height < <(calc "($1) * $stage_size / $hall_width," \
    "($2) * $stage_size / $hall_depth, ($3) * $stage_size / $hall_width," \
    "($4) * $stage_size / $hall_depth")
  admin_call -X POST "$base_url/admin/api/lans/$lan_id/areas" \
    -d "{\"x\":$x,\"y\":$y,\"width\":$width,\"height\":$height,\"kind\":\"$5\",\"blocks\":${6:-false},\"prop\":\"${7:-}\",\"rotation\":${8:-0}}" \
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
    create_area "$half_x + $start * $desk_width" "$seats_y" "$length * $desk_width" \
      "$seat_depth" seats
  done < <(list_runs "$pattern" G)
}

# create_half_desks <row top> <half x> <pattern> adds one desk per cell. All desks of the hall have
# the same size, a gaming desk is just a desk with a player in front of it.
create_half_desks() {
  local top="$1" half_x="$2" pattern="$3" place
  for ((place = 0; place < ${#pattern}; place++)); do
    create_area "$half_x + $place * $desk_width" "$top" "$desk_width" "$desk_depth" none true desk
  done
}

create_areas() {
  local row top left right side spine_desk
  admin_call -X PATCH "$base_url/admin/api/lans/$lan_id/rules" \
    -d "{\"room_width\":$hall_width,\"room_depth\":$hall_depth}" >/dev/null || exit 2
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
  for ((spine_desk = 0; spine_desk < spine_desks; spine_desk++)); do
    create_area "$spine_x" "$spine_top + $spine_desk * $desk_depth" "$desk_width" "$desk_depth" \
      none true desk
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
