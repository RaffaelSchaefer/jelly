// Package movement plans how the jellies walk through the room. Plans are pure calculations: the
// caller passes the roster and the time, so the package needs neither a clock nor a database.
package movement

import (
	"math"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const (
	// unitsPerJelly is how many floor units one jelly is wide. Distances of the planner, like the
	// personal space, are counted in these units, so they follow the size of a jelly in the hall.
	unitsPerJelly = 1.7
	percentAll    = 100.0
	// Waypoints travel with two decimals, about a hundredth of a jelly.
	roundingFactor = 100.0
)

// Point is a position in percent of the room, the unit of the API.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// floorFrame is the room on the floor of the planner. Clients speak in percent of the room, the
// rules in meters.
type floorFrame struct {
	width         float64
	depth         float64
	metersPerUnit float64
}

// newFloorFrame measures the room of a LAN in floor units. A hall of 22 meters with jellies of half
// a meter is about 75 units wide.
func newFloorFrame(room rules.Room) floorFrame {
	metersPerUnit := room.JellyMeters / unitsPerJelly
	return floorFrame{
		width:         room.WidthMeters / metersPerUnit,
		depth:         room.DepthMeters / metersPerUnit,
		metersPerUnit: metersPerUnit,
	}
}

// floorPoint is a position on the floor in floor units: x to the right, z toward the camera.
type floorPoint struct {
	X float64
	Z float64
}

// floorRect is a rectangle on the floor in floor units. The edges say where it would stand without
// its turn, which goes around its middle.
type floorRect struct {
	MinX float64
	MinZ float64
	MaxX float64
	MaxZ float64
	Turn rules.Turn
}

// listRoomRect returns the whole floor.
func (frame floorFrame) listRoomRect() floorRect {
	return floorRect{
		MinX: -frame.width * half,
		MinZ: -frame.depth * half,
		MaxX: frame.width * half,
		MaxZ: frame.depth * half,
		Turn: rules.NewTurn(0),
	}
}

// toFloorPoint converts a position in percent to the floor.
func (frame floorFrame) toFloorPoint(point Point) floorPoint {
	return floorPoint{
		X: (point.X/percentAll - half) * frame.width,
		Z: (point.Y/percentAll - half) * frame.depth,
	}
}

// toPoint converts a floor position to percent, rounded for the API.
func (frame floorFrame) toPoint(point floorPoint) Point {
	return Point{
		X: roundValue((point.X/frame.width + half) * percentAll),
		Y: roundValue((point.Z/frame.depth + half) * percentAll),
	}
}

// roundValue keeps two decimals.
func roundValue(value float64) float64 {
	return math.Round(value*roundingFactor) / roundingFactor
}

// toFloorRect converts an area to its rectangle on the floor.
func (frame floorFrame) toFloorRect(area rules.Area) floorRect {
	start := frame.toFloorPoint(Point{X: area.X, Y: area.Y})
	end := frame.toFloorPoint(Point{X: area.X + area.Width, Y: area.Y + area.Height})
	return floorRect{
		MinX: start.X, MinZ: start.Z, MaxX: end.X, MaxZ: end.Z, Turn: rules.NewTurn(area.Rotation),
	}
}

// shrinkRect moves every edge inward. A side that gets too short shrinks to its middle.
func shrinkRect(rect floorRect, margin float64) floorRect {
	return floorRect{
		MinX: moveEdgeInward(rect.MinX, rect.MaxX, margin),
		MinZ: moveEdgeInward(rect.MinZ, rect.MaxZ, margin),
		MaxX: moveEdgeInward(rect.MaxX, rect.MinX, margin),
		MaxZ: moveEdgeInward(rect.MaxZ, rect.MinZ, margin),
		Turn: rect.Turn,
	}
}

// moveEdgeInward moves an edge toward the opposite one, but not past the middle between them.
func moveEdgeInward(edge, opposite, margin float64) float64 {
	if math.Abs(opposite-edge) <= margin+margin {
		return (edge + opposite) * half
	}
	if edge < opposite {
		return edge + margin
	}
	return edge - margin
}

// toRectFrame turns a point back, so it can be compared with the edges of a rectangle.
func toRectFrame(point floorPoint, rect floorRect) floorPoint {
	if !rect.Turn.IsTurned() {
		return point
	}
	middle := findRectCenter(rect)
	offset := rect.Turn.Undo(rules.FloorOffset{X: point.X - middle.X, Z: point.Z - middle.Z})
	return floorPoint{X: middle.X + offset.X, Z: middle.Z + offset.Z}
}

// fromRectFrame returns where a point within the edges of a rectangle stands on the floor.
func fromRectFrame(point floorPoint, rect floorRect) floorPoint {
	if !rect.Turn.IsTurned() {
		return point
	}
	middle := findRectCenter(rect)
	offset := rect.Turn.Apply(rules.FloorOffset{X: point.X - middle.X, Z: point.Z - middle.Z})
	return floorPoint{X: middle.X + offset.X, Z: middle.Z + offset.Z}
}

// clampIntoRect returns the closest point inside a rectangle.
func clampIntoRect(point floorPoint, rect floorRect) floorPoint {
	local := toRectFrame(point, rect)
	return fromRectFrame(floorPoint{
		X: min(rect.MaxX, max(rect.MinX, local.X)),
		Z: min(rect.MaxZ, max(rect.MinZ, local.Z)),
	}, rect)
}

// isInsideRect says whether a point lies in a rectangle, edges included.
func isInsideRect(point floorPoint, rect floorRect) bool {
	local := toRectFrame(point, rect)
	return local.X >= rect.MinX && local.X <= rect.MaxX &&
		local.Z >= rect.MinZ && local.Z <= rect.MaxZ
}

// measureDistance returns the distance between two floor points.
func measureDistance(from, to floorPoint) float64 {
	return math.Hypot(to.X-from.X, to.Z-from.Z)
}

// measureRectDistance returns the distance from a point to a rectangle, 0 inside.
func measureRectDistance(point floorPoint, rect floorRect) float64 {
	local := toRectFrame(point, rect)
	outsideX := max(rect.MinX-local.X, 0, local.X-rect.MaxX)
	outsideZ := max(rect.MinZ-local.Z, 0, local.Z-rect.MaxZ)
	return math.Hypot(outsideX, outsideZ)
}
