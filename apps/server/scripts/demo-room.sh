#!/usr/bin/env bash
# Sets up the room of a demo server, shaped like a ribcage: a central spine with cables, ribs going
# left and right, and between two ribs a U of tables that opens outward. A group sits inside its U.
# Tables, ribs and spine are thin areas nobody sits in, so they only show up on the floor.
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
table_gap=2
table_depth=2

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

# Both helpers take: <bay top> <left end of the bay> <right end> <side of the closed end>.
# The closed end of a U faces the spine, so the open end points to the outside of the room.

# create_group_seats adds the inside of the U, where the jellies of a group stand.
create_group_seats() {
  local top="$1" left="$2" right="$3" closed_side="$4"
  local seats_left="$left" width=$((right - left - table_depth))
  [ "$closed_side" = left ] && seats_left=$((left + table_depth))
  create_area "$seats_left" "$((top + rib_thickness + table_gap + table_depth))" "$width" \
    "$((bay_height - rib_thickness - 2 * table_gap - 2 * table_depth))"
}

# create_group_tables adds the three tables of the U.
create_group_tables() {
  local top="$1" left="$2" right="$3" closed_side="$4"
  local width=$((right - left)) closed_x="$left"
  local upper_y=$((top + rib_thickness + table_gap)) lower_y=$((top + bay_height - table_gap - table_depth))
  [ "$closed_side" = right ] && closed_x=$((right - table_depth))
  create_area "$left" "$upper_y" "$width" "$table_depth"
  create_area "$closed_x" "$((upper_y + table_depth))" "$table_depth" "$((lower_y - upper_y - table_depth))"
  create_area "$left" "$lower_y" "$width" "$table_depth"
}

# for_each_bay <helper> calls the helper for the left and the right bay of every row.
for_each_bay() {
  local helper="$1" bay top
  for ((bay = 0; bay < bays_per_side; bay++)); do
    top=$((first_rib_y + bay * bay_height))
    "$helper" "$top" "$side_margin" "$((spine_x - table_gap))" right
    "$helper" "$top" "$((spine_x + spine_width + table_gap))" "$((100 - side_margin))" left
  done
}

create_areas() {
  local rib top
  # Seats come first: assign_players finds the seats of a group by their position in this order.
  for_each_bay create_group_seats
  for_each_bay create_group_tables
  for ((rib = 0; rib <= bays_per_side; rib++)); do
    top=$((first_rib_y + rib * bay_height))
    create_area "$side_margin" "$top" "$((spine_x - side_margin))" "$rib_thickness"
    create_area "$((spine_x + spine_width))" "$top" "$((100 - side_margin - spine_x - spine_width))" \
      "$rib_thickness"
  done
  create_area "$spine_x" "$first_rib_y" "$spine_width" "$((bays_per_side * bay_height + rib_thickness))"
}

# Deals all registered jellies to the groups in turn.
assign_players() {
  local position=0 player_id area_id groups=$((2 * bays_per_side))
  local -a areas
  mapfile -t areas < <(admin_call "$base_url/admin/api/lans/$lan_id/areas" |
    grep -o '"areas":\[[^]]*\]' | grep -o '"id":[0-9]*' | cut -d: -f2)
  for player_id in $(admin_call "$base_url/admin/api/players" | grep -o '"id":[0-9]*' | cut -d: -f2); do
    area_id="${areas[$((position % groups))]}"
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
