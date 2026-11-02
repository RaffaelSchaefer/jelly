package rules

import (
	"errors"
	"hash/fnv"
	"strconv"
)

const (
	stageSize    = 100
	maxAreaCount = 32
	// Keeps home spots away from the area edge, so wandering jellies stay inside.
	homeMarginPercent = 10
	// The two halves of a player hash give independent positions on both axes.
	hashHalfBits = 16
	hashHalfMask = 1<<hashHalfBits - 1
)

// ErrInvalidArea reports an area outside the stage or without a size.
var ErrInvalidArea = errors.New("invalid area")

// Area is a rectangle on the stage, in percent of its width and height.
type Area struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

// HomeSpot is where a jelly wanders around, in percent of the stage.
type HomeSpot struct {
	X float64 `json:"home_x"`
	Y float64 `json:"home_y"`
}

// ValidateAreas checks a room layout. Areas may touch or overlap, the layout is only a rough map.
func ValidateAreas(areas []Area) error {
	if len(areas) > maxAreaCount {
		return ErrInvalidArea
	}
	for _, area := range areas {
		isInside := area.X >= 0 && area.Y >= 0 &&
			area.X+area.Width <= stageSize && area.Y+area.Height <= stageSize
		if !isInside || area.Width <= 0 || area.Height <= 0 {
			return ErrInvalidArea
		}
	}
	return nil
}

// WholeStage returns the area of a jelly that has no area assigned.
func WholeStage() Area {
	return Area{X: 0, Y: 0, Width: stageSize, Height: stageSize}
}

// CalculateHomeSpot places a jelly by its ID, so every screen and every reload agrees.
func CalculateHomeSpot(area Area, playerID int64) HomeSpot {
	hasher := fnv.New32a()
	// A hash never returns a write error.
	_, _ = hasher.Write([]byte(strconv.FormatInt(playerID, 10)))
	hash := hasher.Sum32()
	return HomeSpot{
		X: placeInSpan(area.X, area.Width, hash&hashHalfMask),
		Y: placeInSpan(area.Y, area.Height, hash>>hashHalfBits),
	}
}

// placeInSpan maps a 16-bit value to a position inside a span, without its margins.
func placeInSpan(start, length int, value uint32) float64 {
	margin := float64(length) * homeMarginPercent / stageSize
	usable := float64(length) - margin - margin
	return float64(start) + margin + usable*float64(value)/hashHalfMask
}
