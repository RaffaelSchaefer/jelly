package rules

import "slices"

const (
	// MapFormatVersion is the format of map files that this server reads.
	MapFormatVersion = 1
	maxMapZones      = 2000
)

// RoomMap is a map file. It says what stands where in a room and never who uses it, because that
// is the assignment an admin makes. Zones are found again by their ID when a map is imported again.
type RoomMap struct {
	Version int       `json:"version"`
	Zones   []MapZone `json:"zones"`
}

// MapZone is one zone of a map file, in percent of the stage. `Prop` is empty for bare floor.
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

// ToArea returns the zone as an area without an assignment.
func (zone MapZone) ToArea() Area {
	return Area{
		X: zone.X, Y: zone.Y, Width: zone.Width, Height: zone.Height, Rotation: zone.Rotation,
		Kind: AreaKindNone, Blocks: zone.Blocks, Prop: zone.Prop,
	}
}

// IsMapSizeValid reports whether a map has a known format and is small enough for the planner.
func IsMapSizeValid(roomMap RoomMap) bool {
	return roomMap.Version == MapFormatVersion && len(roomMap.Zones) <= maxMapZones
}

// ListInvalidMapZones returns the IDs of zones that cannot be imported: without a usable ID, with
// an
// ID that came before, with a name that is too long or outside the stage.
func ListInvalidMapZones(zones []MapZone) []string {
	invalid := []string{}
	seen := map[string]bool{}
	for _, zone := range zones {
		isUsable := zone.ID != "" && len(zone.ID) <= maxZoneTextLength && !seen[zone.ID] &&
			len(zone.Name) <= maxZoneTextLength && ValidateArea(zone.ToArea()) == nil
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
