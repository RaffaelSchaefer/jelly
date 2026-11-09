package rules

import "slices"

const (
	// MapFormatPercent is the first map format, with zones in percent of the stage.
	MapFormatPercent = 1
	// MapFormatMeters is the map format with zones in meters of the real room.
	MapFormatMeters = 2
	maxMapZones     = 2000
)

// RoomMap is a map file. It says what stands where in a room and never who uses it, because that
// is the assignment an admin makes. Zones are found again by their ID when a map is imported again.
type RoomMap struct {
	Version int       `json:"version"`
	Zones   []MapZone `json:"zones"`
}

// MapZone is one zone of a map file, in percent of the stage (version 1) or in meters (version 2).
// `Prop` is empty for bare floor.
type MapZone struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	// Rotation is in degrees, clockwise around the middle of the zone. Without one, a model faces
	// the camera.
	Rotation float64 `json:"rotation"`
	Blocks   bool    `json:"blocks"`
	Prop     string  `json:"prop"`
}

// ToPercent returns the map in percent of the stage, so the rest of the server needs no meters. A
// map of version 1 is already in percent and stays as it is.
func (roomMap RoomMap) ToPercent(room RoomMeters) RoomMap {
	if roomMap.Version != MapFormatMeters {
		return roomMap
	}
	zones := make([]MapZone, len(roomMap.Zones))
	for index, zone := range roomMap.Zones {
		zone.X, zone.Width = room.ToPercentX(zone.X), room.ToPercentX(zone.Width)
		zone.Y, zone.Height = room.ToPercentY(zone.Y), room.ToPercentY(zone.Height)
		zones[index] = zone
	}
	return RoomMap{Version: MapFormatPercent, Zones: zones}
}

// ToArea returns the zone as an area without an assignment.
func (zone MapZone) ToArea() Area {
	return Area{
		X: zone.X, Y: zone.Y, Width: zone.Width, Height: zone.Height, Rotation: zone.Rotation,
		Kind: AreaKindNone, Blocks: zone.Blocks, Prop: zone.Prop,
	}
}

// IsMapSizeValid reports whether a map has a known format and is small enough for the planner.
func IsMapSizeValid(roomMap RoomMap) bool {
	isKnown := roomMap.Version == MapFormatPercent || roomMap.Version == MapFormatMeters
	return isKnown && len(roomMap.Zones) <= maxMapZones
}

// IsZoneNameValid reports whether a name fits on the admin page and the stage.
func IsZoneNameValid(name string) bool {
	return len(name) <= maxZoneTextLength
}

// ListInvalidMapZones returns the IDs of zones that cannot be imported: without a usable ID, with
// an
// ID that came before, with a name that is too long or outside the stage.
func ListInvalidMapZones(zones []MapZone) []string {
	invalid := []string{}
	seen := map[string]bool{}
	for _, zone := range zones {
		isUsable := zone.ID != "" && len(zone.ID) <= maxZoneTextLength && !seen[zone.ID] &&
			IsZoneNameValid(zone.Name) && ValidateArea(zone.ToArea()) == nil
		if !isUsable {
			invalid = append(invalid, zone.ID)
		}
		seen[zone.ID] = true
	}
	return invalid
}

// ListUnknownProps returns every prop of a map that this server does not know, without repeats.
func ListUnknownProps(zones []MapZone) []string {
	unknown := []string{}
	for _, zone := range zones {
		isKnown := zone.Prop == "" || slices.Contains(ListProps(), zone.Prop)
		if !isKnown && !slices.Contains(unknown, zone.Prop) {
			unknown = append(unknown, zone.Prop)
		}
	}
	slices.Sort(unknown)
	return unknown
}

// ListProps returns every model a zone can show. Whole sets exist next to their parts, so a map can
// use one large model or place many small ones.
func ListProps() []string {
	return slices.Concat(listStageProps(), listLoungeProps(), listSnackProps())
}

// listStageProps returns the stage and what stands on it.
func listStageProps() []string {
	return []string{
		"stage-set", "stage-platform", "screen", "speaker", "pedestal", "trophy", "par-light",
		"sockets", "desk", "cable",
	}
}

// listLoungeProps returns the lounge and what stands in it.
func listLoungeProps() []string {
	return []string{
		"lounge-set", "rug", "sign-wall", "lava-lamp", "beanbag", "couch", "snake-plant", "bush",
		"cactus", "string-lights",
	}
}

// listSnackProps returns the snack bar and what stands on it.
func listSnackProps() []string {
	return []string{
		"snack-bar-set", "counter", "marquee", "fridge", "slush-machine", "popcorn-machine",
		"pizza-stack", "donut-stand", "cups",
	}
}
