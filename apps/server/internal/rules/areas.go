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

// Kinds of areas. Jellies stand on seats, on the stage and in the lounge, walk over cables and
// walk around desks and the snack bar.
const (
	AreaKindSeats    = "seats"
	AreaKindDesk     = "desk"
	AreaKindCable    = "cable"
	AreaKindStage    = "stage"
	AreaKindLounge   = "lounge"
	AreaKindSnackbar = "snackbar"
)

// ErrInvalidArea reports an area outside the stage, without a size or of an unknown kind.
var ErrInvalidArea = errors.New("invalid area")

// Area is a rectangle on the stage, in percent of its width and height.
type Area struct {
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Kind   string `json:"kind"`
}

// Room says what the coordinates of the stage mean, so they can become meters without a new API.
type Room struct {
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Unit   string `json:"unit"`
}

// DescribeRoom returns the size of the room. All coordinates are percent so far.
func DescribeRoom() Room {
	return Room{Width: stageSize, Height: stageSize, Unit: roomUnitPercent}
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

// ValidateArea checks one area. Areas may touch or overlap, the layout is only a rough map.
func ValidateArea(area Area) error {
	isInside := area.X >= 0 && area.Y >= 0 &&
		area.X+area.Width <= stageSize && area.Y+area.Height <= stageSize
	if !isInside || area.Width <= 0 || area.Height <= 0 {
		return ErrInvalidArea
	}
	if !slices.Contains(listAreaKinds(), area.Kind) {
		return ErrInvalidArea
	}
	return nil
}

// listAreaKinds returns every kind an area can have.
func listAreaKinds() []string {
	return []string{
		AreaKindSeats, AreaKindDesk, AreaKindCable, AreaKindStage, AreaKindLounge, AreaKindSnackbar,
	}
}

// IsStandingKind reports whether jellies can belong to an area of this kind.
func IsStandingKind(kind string) bool {
	return kind == AreaKindSeats || kind == AreaKindStage || kind == AreaKindLounge
}

// WholeStage returns the area of a jelly that has no area assigned.
func WholeStage() Area {
	return Area{X: 0, Y: 0, Width: stageSize, Height: stageSize, Kind: AreaKindSeats}
}

// CalculateHomeSpot returns the spot of the jelly with this place in its area, counted from 0.
func CalculateHomeSpot(area Area, place int) HomeSpot {
	return HomeSpot{
		X: placeInSpan(area.X, area.Width, calculateSpreadShare(place, spreadStepX)),
		Y: placeInSpan(area.Y, area.Height, calculateSpreadShare(place, spreadStepY)),
	}
}

// calculateSpreadShare returns a share from 0 to below 1. Consecutive places land far apart.
func calculateSpreadShare(place int, step float64) float64 {
	_, share := math.Modf(float64(place+1) * step)
	return share
}

// placeInSpan maps a share to a position inside a span, without its margins.
func placeInSpan(start, length int, share float64) float64 {
	margin := float64(length) * homeMarginPercent / stageSize
	usable := float64(length) - margin - margin
	return float64(start) + margin + usable*share
}
