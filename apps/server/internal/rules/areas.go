package rules

import (
	"errors"
	"math"
)

const (
	stageSize = 100
	// Keeps home spots away from the area edge, so wandering jellies stay inside.
	homeMarginPercent = 10
	// Steps of the R2 sequence, which fills a rectangle evenly for any number of places.
	spreadStepX = 0.7548776662466927
	spreadStepY = 0.5698402909980532
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

// ValidateArea checks one area. Areas may touch or overlap, the layout is only a rough map.
func ValidateArea(area Area) error {
	isInside := area.X >= 0 && area.Y >= 0 &&
		area.X+area.Width <= stageSize && area.Y+area.Height <= stageSize
	if !isInside || area.Width <= 0 || area.Height <= 0 {
		return ErrInvalidArea
	}
	return nil
}

// WholeStage returns the area of a jelly that has no area assigned.
func WholeStage() Area {
	return Area{X: 0, Y: 0, Width: stageSize, Height: stageSize}
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
