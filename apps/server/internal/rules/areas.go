package rules

import (
	"errors"
	"math"
	"slices"
)

const (
	stageSize       = 100
	roomUnitPercent = "percent"
	// Keeps home spots away from the area edge, so wandering jellies stay inside.
	homeMarginPercent = 10
	// Steps of the R2 sequence, which fills a rectangle evenly for any number of places.
	spreadStepX = 0.7548776662466927
	spreadStepY = 0.5698402909980532
)

// What a zone is assigned to, which only says how jellies use it. What stands there is its prop,
// and `Blocks` says whether they can walk through. The code never looks at the name of a zone.
const (
	AreaKindSeats    = "seats"
	AreaKindStage    = "stage"
	AreaKindLounge   = "lounge"
	AreaKindVisitors = "visitors"
	// Jellies line up in these zones after a report and during a food event.
	AreaKindQueue = "queue"
	// Only these zones show their name, so players can be sent there on purpose.
	AreaKindPublic = "public"
	// Where the audience and the winner stand during a ceremony.
	AreaKindSpectators = "spectators"
	AreaKindWinner     = "winner"
	AreaKindNone       = "none"
)

// maxZoneTextLength limits every text of a zone, so a map stays a small file.
const maxZoneTextLength = 64

// ErrInvalidArea reports an area outside the stage, without a size or of an unknown kind.
var ErrInvalidArea = errors.New("invalid area")

// Area is a rectangle on the stage, in percent of its width and height. X, Y, width and height say
// where it would stand without rotation.
type Area struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	// Rotation is in degrees, clockwise around the middle of the area. At 0, a model
	// faces the camera.
	Rotation float64 `json:"rotation"`
	Kind     string  `json:"kind"`
	// Blocks keeps jellies out, they walk around this zone.
	Blocks bool `json:"blocks"`
	// Prop names the model that stands here, empty for bare floor.
	Prop string `json:"prop"`
}

// Room says what the coordinates of the stage mean. Positions stay percent of the room, so the
// stage keeps working. `WidthMeters`, `DepthMeters` and `JellyMeters` give the real size, from
// which clients can convert to meters.
type Room struct {
	Width       int     `json:"width"`
	Height      int     `json:"height"`
	Unit        string  `json:"unit"`
	WidthMeters float64 `json:"width_m"`
	DepthMeters float64 `json:"depth_m"`
	JellyMeters float64 `json:"jelly_m"`
}

// DescribeRoom returns the size of the room of a LAN. All coordinates are percent so far.
func DescribeRoom(public PublicRules) Room {
	return Room{
		Width: stageSize, Height: stageSize, Unit: roomUnitPercent,
		WidthMeters: public.RoomWidthMeters, DepthMeters: public.RoomDepthMeters,
		JellyMeters: public.JellyWidthMeters,
	}
}

// HomeSpot is where a jelly wanders around, in percent of the stage.
type HomeSpot struct {
	X float64 `json:"home_x"`
	Y float64 `json:"home_y"`
}

// StagePoint is a point on the stage, in percent.
type StagePoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// IsOnStage reports whether a point lies on the stage. NaN fails both comparisons.
func IsOnStage(point StagePoint) bool {
	return point.X >= 0 && point.X <= stageSize && point.Y >= 0 && point.Y <= stageSize
}

// ValidateArea checks one area in the room of its LAN. Areas may touch or overlap, the layout is
// only a rough map.
func ValidateArea(area Area, room RoomMeters) error {
	hasSize := area.Width > 0 && area.Height > 0
	if !hasSize || !isRotationValid(area.Rotation) || !area.fitsOnStage(room) {
		return ErrInvalidArea
	}
	if !slices.Contains(listAreaKinds(), area.Kind) || len(area.Prop) > maxZoneTextLength {
		return ErrInvalidArea
	}
	return nil
}

// listAreaKinds returns every kind an area can have.
func listAreaKinds() []string {
	return []string{
		AreaKindSeats, AreaKindStage, AreaKindLounge, AreaKindVisitors, AreaKindQueue,
		AreaKindPublic, AreaKindSpectators, AreaKindWinner, AreaKindNone,
	}
}

// IsStandingKind reports whether jellies can belong to an area of this kind.
func IsStandingKind(kind string) bool {
	return kind == AreaKindSeats || kind == AreaKindStage || kind == AreaKindLounge ||
		kind == AreaKindVisitors
}

// WholeStage returns the area of a jelly that has no area assigned.
func WholeStage() Area {
	return Area{
		X:        0,
		Y:        0,
		Width:    stageSize,
		Height:   stageSize,
		Rotation: 0,
		Kind:     AreaKindSeats,
		Blocks:   false,
		Prop:     "",
	}
}

// CalculateHomeSpot returns the spot of the jelly with this place in its area, counted from 0.
func CalculateHomeSpot(area Area, place int, room RoomMeters) HomeSpot {
	spot := area.turnPoint(StagePoint{
		X: placeInSpan(area.X, area.Width, calculateSpreadShare(place, spreadStepX)),
		Y: placeInSpan(area.Y, area.Height, calculateSpreadShare(place, spreadStepY)),
	}, room)
	return HomeSpot(spot)
}

// calculateSpreadShare returns a share from 0 to below 1. Consecutive places land far apart.
func calculateSpreadShare(place int, step float64) float64 {
	_, share := math.Modf(float64(place+1) * step)
	return share
}

// placeInSpan maps a share to a position inside a span, without its margins.
func placeInSpan(start, length, share float64) float64 {
	margin := length * homeMarginPercent / stageSize
	usable := length - margin - margin
	return start + margin + usable*share
}

// IsOnFreeFloor reports whether a jelly can stand on a point: on the stage and outside of every
// zone that blocks.
func IsOnFreeFloor(point StagePoint, areas []Area, room RoomMeters) bool {
	if !IsOnStage(point) {
		return false
	}
	return !slices.ContainsFunc(areas, func(area Area) bool {
		return area.Blocks && area.containsPoint(point, room)
	})
}
