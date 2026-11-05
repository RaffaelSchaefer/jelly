#!/usr/bin/env bash
# Sets up the room of a demo server like the hall of the LAN. At the back is the stage with two
# beamers, in front of it the chillout lounge on the left and the snack bar on the right. Then a
# spine of desks runs down the middle with rows of desks on each side and aisles between them. Most
# rows come in threes: gaming desks, a desk row for the network gear, gaming desks again. Each
# player of a gaming desk stands in the aisle in front of it, and a group is one row of gaming
# desks in one half.
# Usage: scripts/demo-room.sh areas|assign <base-url> <admin-secret>
set -u

step="$1"
base_url="$2"
admin_secret="$3"
lan_id=1

# Columns in percent of the stage width: a margin, four places, the spine, four places, a margin.
left_half_x=5
right_half_x=55
place_width=10
spine_x=45
# Depths in percent of the stage depth.
row_depth=2
seat_depth=5
spine_top=22
spine_bottom=90
# The front of the hall as x y width height kind blocks prop: stage with what stands on it, lounge,
# the snack bar counter with its queue, and a zone for visitors.
front_zones=(
  "5 1 90 8 stage false stage-set"
  "22 1.75 20 0.5 none true screen"
  "58 1.75 20 0.5 none true screen"
  "7.86 1.5 4.76 2 none true speaker"
  "87.38 1.5 4.76 2 none true speaker"
  "48.33 1.63 3.33 1.75 none true pedestal"
  "5 12 40 10 lounge false lounge-set"
  "65 14 20 3 none true snack-bar-set"
  "50 17 45 5 queue false"
)

# Rows from the back of the hall to the front: top edge, left half, right half, and the side the
# players of the gaming desks stand on. D is a desk, G a gaming desk for one player.
rows=(
  "24 DDDD DDDD none"
  "26 GGGG GGGG below"
  "38 GGGG GGGG above"
  "40 DDDD DDDD none"
  "42 GGGG GGGG below"
  "54 GGGG GGGG above"
  "56 DDDD DDDD none"
  "58 GGGG GGGG below"
  "70 GGGG GGGG above"
  "72 DDDD DDDD none"
  "74 GGGG GGGG below"
  "86 GGGG GGGG above"
  "88 DDGG GGDD below"
)

cookie="$(curl -si -X POST "$base_url/admin/api/login" -H 'Content-Type: application/json' \
  -d "{\"secret\":\"$admin_secret\"}" | sed -n 's/^[Ss]et-[Cc]ookie: \([^;]*\).*/\1/p')"

admin_call() {
  curl -sf -b "$cookie" -H 'Content-Type: application/json' "$@"
}

# create_area x y width height kind [blocks] [prop]
create_area() {
  admin_call -X POST "$base_url/admin/api/lans/$lan_id/areas" \
    -d "{\"x\":$1,\"y\":$2,\"width\":$3,\"height\":$4,\"kind\":\"$5\",\"blocks\":${6:-false},\"prop\":\"${7:-}\"}" \
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
  seats_y=$((top + row_depth))
  [ "$side" = above ] && seats_y=$((top - seat_depth))
  while read -r start length; do
    create_area "$((half_x + start * place_width))" "$seats_y" "$((length * place_width))" \
      "$seat_depth" seats
  done < <(list_runs "$pattern" G)
}

# create_half_desks <row top> <half x> <pattern> adds one desk per cell. All desks of the hall have
# the same size, a gaming desk is just a desk with a player in front of it.
create_half_desks() {
  local top="$1" half_x="$2" pattern="$3" place
  for ((place = 0; place < ${#pattern}; place++)); do
    create_area "$((half_x + place * place_width))" "$top" "$place_width" "$row_depth" none true desk
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
  for ((top = spine_top; top < spine_bottom; top += row_depth)); do
    create_area "$spine_x" "$top" "$place_width" "$row_depth" none true desk
  done
  local zone
  for zone in "${front_zones[@]}"; do
    # shellcheck disable=SC2086 # The zone is split into its fields on purpose.
    create_area $zone
  done
}

# Deals all registered jellies to the places in turn, so a group gets one jelly per gaming desk.
assign_players() {
  local position=0 player_id area_id width place
  local -a places
  while read -r area_id width; do
    for ((place = 0; place < width / place_width; place++)); do
      places+=("$area_id")
    done
  done < <(admin_call "$base_url/admin/api/lans/$lan_id/areas" |
    grep -o '"areas":\[[^]]*\]' | grep -o '"id":[0-9]*[^}]*"kind":"seats"' |
    sed 's/"id":\([0-9]*\).*"width":\([0-9]*\).*/\1 \2/')
  for player_id in $(admin_call "$base_url/admin/api/players" | grep -o '"id":[0-9]*' | cut -d: -f2); do
    area_id="${places[$((position % ${#places[@]}))]}"
    admin_call -X PUT "$base_url/admin/api/lans/$lan_id/players/$player_id/area" \
      -d "{\"area_id\":$area_id}" >/dev/null
    position=$((position + 1))
  done
}

case "$step" in
  areas) create_areas ;;
  assign) assign_players ;;
  *) echo "Unknown step: $step"; exit 2 ;;
esac
