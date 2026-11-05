// Package movement plans how the jellies walk through the room. Plans are pure calculations: the
// caller passes the roster and the time, so the package needs neither a clock nor a database.
package movement

import (
	"math"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const (
	// The room in jelly units, a jelly is about 1.7 wide. Clients speak in percent of the room.
	roomWidth  = 21.0
	roomDepth  = 40.0
	percentAll = 100.0
	// Waypoints travel with two decimals, about a hundredth of a jelly.
	roundingFactor = 100.0
)

// Point is a position in percent of the room, the unit of the API.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// floorPoint is a position on the floor in jelly units: x to the right, z toward the camera.
type floorPoint struct {
	X float64
	Z float64
}

// floorRect is a rectangle on the floor in jelly units.
type floorRect struct {
	MinX float64
	MinZ float64
	MaxX float64
	MaxZ float64
}

// listRoomRect returns the whole floor.
func listRoomRect() floorRect {
	return floorRect{
		MinX: -roomWidth * half,
		MinZ: -roomDepth * half,
		MaxX: roomWidth * half,
		MaxZ: roomDepth * half,
	}
}

// toFloorPoint converts a position in percent to the floor.
func toFloorPoint(point Point) floorPoint {
	return floorPoint{
		X: (point.X/percentAll - half) * roomWidth,
		Z: (point.Y/percentAll - half) * roomDepth,
	}
}

// toPoint converts a floor position to percent, rounded for the API.
func toPoint(point floorPoint) Point {
	return Point{
		X: roundValue((point.X/roomWidth + half) * percentAll),
		Y: roundValue((point.Z/roomDepth + half) * percentAll),
	}
}

// roundValue keeps two decimals.
func roundValue(value float64) float64 {
	return math.Round(value*roundingFactor) / roundingFactor
}

// toFloorRect converts an area to its rectangle on the floor.
func toFloorRect(area rules.Area) floorRect {
	start := toFloorPoint(Point{X: float64(area.X), Y: float64(area.Y)})
	end := toFloorPoint(Point{
		X: float64(area.X + area.Width), Y: float64(area.Y + area.Height),
	})
	return floorRect{MinX: start.X, MinZ: start.Z, MaxX: end.X, MaxZ: end.Z}
}

// shrinkRect moves every edge inward. A side that gets too short shrinks to its middle.
func shrinkRect(rect floorRect, margin float64) floorRect {
	return floorRect{
		MinX: moveEdgeInward(rect.MinX, rect.MaxX, margin),
		MinZ: moveEdgeInward(rect.MinZ, rect.MaxZ, margin),
		MaxX: moveEdgeInward(rect.MaxX, rect.MinX, margin),
		MaxZ: moveEdgeInward(rect.MaxZ, rect.MinZ, margin),
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

// clampIntoRect returns the closest point inside a rectangle.
func clampIntoRect(point floorPoint, rect floorRect) floorPoint {
	return floorPoint{
		X: min(rect.MaxX, max(rect.MinX, point.X)),
		Z: min(rect.MaxZ, max(rect.MinZ, point.Z)),
	}
}

// isInsideRect says whether a point lies in a rectangle, edges included.
func isInsideRect(point floorPoint, rect floorRect) bool {
	return point.X >= rect.MinX && point.X <= rect.MaxX &&
		point.Z >= rect.MinZ && point.Z <= rect.MaxZ
}

// measureDistance returns the distance between two floor points.
func measureDistance(from, to floorPoint) float64 {
	return math.Hypot(to.X-from.X, to.Z-from.Z)
}

// measureRectDistance returns the distance from a point to a rectangle, 0 inside.
func measureRectDistance(point floorPoint, rect floorRect) float64 {
	outsideX := max(rect.MinX-point.X, 0, point.X-rect.MaxX)
	outsideZ := max(rect.MinZ-point.Z, 0, point.Z-rect.MaxZ)
	return math.Hypot(outsideX, outsideZ)
}
