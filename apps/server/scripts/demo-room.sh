#!/usr/bin/env bash
# Sets up the room of a demo server, shaped like a ribcage: a central spine with cables, ribs going
# left and right, and between two ribs a U of tables where one group sits.
# An U is three rectangles, spine and ribs are thin areas nobody sits in.
# Usage: scripts/demo-room.sh areas|assign <base-url> <admin-secret>
set -u

step="$1"
base_url="$2"
admin_secret="$3"
lan_id=1

bays_per_side=4
bay_height=24
first_rib_y=2
rib_thickness=1
spine_x=49
spine_width=2
# Distance from the stage edge to the outer end of a rib, and how far tables stay off ribs and spine.
side_margin=4
table_gap=3
table_depth=5
areas_per_group=3
# Which table of the U the next jelly of a group gets: the arms are longer than the closed end.
seat_pattern=(0 2 0 2 1)

cookie="$(curl -si -X POST "$base_url/admin/api/login" -H 'Content-Type: application/json' \
  -d "{\"secret\":\"$admin_secret\"}" | sed -n 's/^[Ss]et-[Cc]ookie: \([^;]*\).*/\1/p')"

admin_call() {
  curl -sf -b "$cookie" -H 'Content-Type: application/json' "$@"
}

# create_area x y width height
create_area() {
  admin_call -X POST "$base_url/admin/api/lans/$lan_id/areas" \
    -d "{\"x\":$1,\"y\":$2,\"width\":$3,\"height\":$4}" >/dev/null || exit 2
}

# create_group_tables <bay top> <left end of the bay> <right end> <side of the closed end>
# The U opens toward the spine, so its closed end is on the outside.
create_group_tables() {
  local top="$1" left="$2" right="$3" closed_side="$4"
  local width=$((right - left)) arm_gap=$((bay_height - 2 * table_gap - table_depth))
  local closed_x="$left"
  [ "$closed_side" = right ] && closed_x=$((right - table_depth))
  create_area "$left" "$((top + table_gap))" "$width" "$table_depth"
  create_area "$closed_x" "$((top + table_gap + table_depth))" "$table_depth" \
    "$((arm_gap - table_depth))"
  create_area "$left" "$((top + table_gap + arm_gap))" "$width" "$table_depth"
}

create_areas() {
  local bay rib top inner_left inner_right
  inner_left=$((spine_x - table_gap))
  inner_right=$((spine_x + spine_width + table_gap))
  # Tables come first: assign_players finds a group by its position in this order.
  for ((bay = 0; bay < bays_per_side; bay++)); do
    top=$((first_rib_y + bay * bay_height))
    create_group_tables "$top" "$side_margin" "$inner_left" left
    create_group_tables "$top" "$inner_right" "$((100 - side_margin))" right
  done
  for ((rib = 0; rib <= bays_per_side; rib++)); do
    top=$((first_rib_y + rib * bay_height))
    create_area "$side_margin" "$top" "$((spine_x - side_margin))" "$rib_thickness"
    create_area "$((spine_x + spine_width))" "$top" "$((100 - side_margin - spine_x - spine_width))" \
      "$rib_thickness"
  done
  create_area "$spine_x" "$first_rib_y" "$spine_width" "$((bays_per_side * bay_height + rib_thickness))"
}

# Deals all registered jellies to the groups in turn, and inside a group to the tables of its U.
assign_players() {
  local position=0 player_id group seat area_id groups=$((2 * bays_per_side))
  local -a areas seats
  mapfile -t areas < <(admin_call "$base_url/admin/api/lans/$lan_id/areas" |
    grep -o '"areas":\[[^]]*\]' | grep -o '"id":[0-9]*' | cut -d: -f2)
  for player_id in $(admin_call "$base_url/admin/api/players" | grep -o '"id":[0-9]*' | cut -d: -f2); do
    group=$((position % groups))
    seat="${seats[$group]:-0}"
    area_id="${areas[$((group * areas_per_group + seat_pattern[seat % ${#seat_pattern[@]}]))]}"
    admin_call -X PUT "$base_url/admin/api/lans/$lan_id/players/$player_id/area" \
      -d "{\"area_id\":$area_id}" >/dev/null
    seats[$group]=$((seat + 1))
    position=$((position + 1))
  done
}

case "$step" in
  areas) create_areas ;;
  assign) assign_players ;;
  *) echo "Unknown step: $step"; exit 2 ;;
esac
