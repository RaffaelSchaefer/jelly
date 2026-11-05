package movement

import (
	"math"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// turnedWall is a wall through the middle of an 8x8 room, on the diagonal from top left to bottom
// right. It leaves a way around at both ends.
func turnedWall() floorRect {
	return floorRect{MinX: 1.5, MinZ: 3.5, MaxX: 6.5, MaxZ: 4.5, Turn: rules.NewTurn(45)}
}

func TestPointsAreComparedWithTheTurnedRectangle(t *testing.T) {
	wall := turnedWall()
	if !isInsideRect(floorPoint{X: 5.5, Z: 5.5}, wall) {
		t.Fatal("the far end of the diagonal belongs to the wall")
	}
	if isInsideRect(floorPoint{X: 2, Z: 4}, wall) {
		t.Fatal("where the wall would stand unturned is free")
	}
	if distance := measureRectDistance(floorPoint{X: 4, Z: 4}, wall); distance != 0 {
		t.Fatalf("the middle is inside, distance %v", distance)
	}
	// One step straight off the long side of the wall.
	aside := floorPoint{X: 4 + 1.5*math.Sqrt2/2, Z: 4 - 1.5*math.Sqrt2/2}
	if distance := measureRectDistance(aside, wall); math.Abs(distance-1) > 1e-9 {
		t.Fatalf("distance %v", distance)
	}
}

func TestClampStaysInsideTheTurnedRectangle(t *testing.T) {
	wall := turnedWall()
	clamped := clampIntoRect(floorPoint{X: 0, Z: 8}, wall)
	if !isInsideRect(clamped, wall) && measureRectDistance(clamped, wall) > 1e-9 {
		t.Fatalf("clamped to %v", clamped)
	}
	if center := findRectCenter(shrinkRect(wall, 0.2)); center != findRectCenter(wall) {
		t.Fatalf("shrinking moved the middle to %v", center)
	}
}

func TestPathGoesAroundATurnedWall(t *testing.T) {
	room := floorRect{MinX: 0, MinZ: 0, MaxX: 8, MaxZ: 8, Turn: rules.NewTurn(0)}
	floor := newGrid(room, []floorRect{turnedWall()}, 0.5)
	if floor.isWalkable(floorPoint{X: 4, Z: 4}) {
		t.Fatal("the middle of the wall is blocked")
	}
	from := floorPoint{X: 2, Z: 6}
	goal := floorPoint{X: 6, Z: 2}
	if floor.hasLineOfSight(from, goal) {
		t.Fatal("the wall stands between both points")
	}
	path := floor.findPath(from, goal)
	if len(path) < 2 || path[len(path)-1] != goal {
		t.Fatalf("path %v", path)
	}
	last := from
	for _, waypoint := range path {
		if !floor.hasLineOfSight(last, waypoint) {
			t.Fatalf("the part from %v to %v crosses the wall", last, waypoint)
		}
		last = waypoint
	}
}

func TestPlacesOfATurnedZoneStayInIt(t *testing.T) {
	zone := floorRect{MinX: -4, MinZ: 2, MaxX: 4, MaxZ: 6, Turn: rules.NewTurn(30)}
	places := listZonePlaces(zone)
	if len(places) < 4 {
		t.Fatalf("places %v", places)
	}
	for _, place := range places {
		if !isInsideRect(place, zone) {
			t.Fatalf("place %v lies outside", place)
		}
	}
}
