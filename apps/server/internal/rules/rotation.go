package rules

import "math"

const (
	// A rotation runs from 0 up to below a full turn.
	fullTurnDegrees = 360.0
	halfTurnDegrees = 180.0
	half            = 0.5
	// Lets a zone touch the edge of the stage although a sine is never exactly 0 at 90 degrees.
	stageEdgeTolerance = 1e-9
)

// FloorOffset is a distance on the floor: x to the right, z toward the camera.
type FloorOffset struct {
	X float64
	Z float64
}

// Turn is a rotation on the floor. The zero value does not turn anything.
type Turn struct {
	sine     float64
	cosine   float64
	isTurned bool
}

// NewTurn returns a clockwise turn seen from above. It keeps sine and cosine, because the grid asks
// once per cell and zone.
func NewTurn(degrees float64) Turn {
	if degrees == 0 {
		return Turn{sine: 0, cosine: 1, isTurned: false}
	}
	sine, cosine := math.Sincos(degrees * math.Pi / halfTurnDegrees)
	return Turn{sine: sine, cosine: cosine, isTurned: true}
}

// IsTurned says whether the turn changes anything.
func (turn Turn) IsTurned() bool {
	return turn.isTurned
}

// Apply turns an offset on the floor.
func (turn Turn) Apply(offset FloorOffset) FloorOffset {
	if !turn.isTurned {
		return offset
	}
	return FloorOffset{
		X: offset.X*turn.cosine - offset.Z*turn.sine,
		Z: offset.X*turn.sine + offset.Z*turn.cosine,
	}
}

// Undo turns an offset back.
func (turn Turn) Undo(offset FloorOffset) FloorOffset {
	if !turn.isTurned {
		return offset
	}
	return FloorOffset{
		X: offset.X*turn.cosine + offset.Z*turn.sine,
		Z: offset.Z*turn.cosine - offset.X*turn.sine,
	}
}

// isRotationValid reports whether a rotation is in range. NaN fails both comparisons.
func isRotationValid(degrees float64) bool {
	return degrees >= 0 && degrees < fullTurnDegrees
}

// findMiddle returns the point that an area turns around.
func (area Area) findMiddle() StagePoint {
	return StagePoint{X: area.X + area.Width*half, Y: area.Y + area.Height*half}
}

// turnPoint moves a point of the area from where it would be without rotation to where it stands.
func (area Area) turnPoint(point StagePoint, room RoomMeters) StagePoint {
	return area.moveOnFloor(point, room, NewTurn(area.Rotation).Apply)
}

// moveOnFloor applies a turn around the middle of the area in meters of the room, so that the area
// keeps its shape. Percent has a different length on each axis. Without a rotation the point stays
// exactly what it is.
func (area Area) moveOnFloor(
	point StagePoint, room RoomMeters, turn func(FloorOffset) FloorOffset,
) StagePoint {
	if area.Rotation == 0 {
		return point
	}
	middle := area.findMiddle()
	offset := turn(FloorOffset{
		X: (point.X - middle.X) * room.Width / stageSize,
		Z: (point.Y - middle.Y) * room.Depth / stageSize,
	})
	return StagePoint{
		X: middle.X + offset.X*stageSize/room.Width, Y: middle.Y + offset.Z*stageSize/room.Depth,
	}
}

// containsPoint reports whether a point lies in the area, edges included.
func (area Area) containsPoint(point StagePoint, room RoomMeters) bool {
	local := area.moveOnFloor(point, room, NewTurn(area.Rotation).Undo)
	return local.X >= area.X && local.X <= area.X+area.Width &&
		local.Y >= area.Y && local.Y <= area.Y+area.Height
}

// fitsOnStage reports whether all corners of the area stand on the stage after its rotation.
func (area Area) fitsOnStage(room RoomMeters) bool {
	corners := []StagePoint{
		{X: area.X, Y: area.Y},
		{X: area.X + area.Width, Y: area.Y},
		{X: area.X, Y: area.Y + area.Height},
		{X: area.X + area.Width, Y: area.Y + area.Height},
	}
	for _, corner := range corners {
		turned := area.turnPoint(corner, room)
		isOnStage := turned.X >= -stageEdgeTolerance && turned.X <= stageSize+stageEdgeTolerance &&
			turned.Y >= -stageEdgeTolerance && turned.Y <= stageSize+stageEdgeTolerance
		if !isOnStage {
			return false
		}
	}
	return true
}
