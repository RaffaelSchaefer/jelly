package rules

import "math"

const (
	// metricDecimals keeps converted values at a ten-thousandth of a percent, far below a
	// millimeter in any hall.
	metricDecimals = 10_000.0
)

// RoomMeters is the real size of a room.
type RoomMeters struct {
	Width float64
	Depth float64
}

// MeterRect is a rectangle in meters, counted from the back left corner of the room.
type MeterRect struct {
	X      float64
	Y      float64
	Width  float64
	Height float64
}

// MeasureRoom returns the real size of the room of a LAN.
func MeasureRoom(public PublicRules) RoomMeters {
	return RoomMeters{Width: public.RoomWidthMeters, Depth: public.RoomDepthMeters}
}

// ToMeters converts an area in percent of the stage to meters.
func (room RoomMeters) ToMeters(area Area) MeterRect {
	return MeterRect{
		X: area.X / stageSize * room.Width, Y: area.Y / stageSize * room.Depth,
		Width: area.Width / stageSize * room.Width, Height: area.Height / stageSize * room.Depth,
	}
}

// ToPercentX converts a distance from left to right in meters to percent of the stage.
func (room RoomMeters) ToPercentX(meters float64) float64 {
	return roundPercent(meters / room.Width * stageSize)
}

// ToPercentY converts a distance from back to front in meters to percent of the stage.
func (room RoomMeters) ToPercentY(meters float64) float64 {
	return roundPercent(meters / room.Depth * stageSize)
}

// roundPercent drops digits no real hall can tell apart, so a map of meters stays stable.
func roundPercent(value float64) float64 {
	return math.Round(value*metricDecimals) / metricDecimals
}
