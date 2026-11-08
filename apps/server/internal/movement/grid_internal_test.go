package movement

import (
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// wallWithGap blocks the middle of an 8x8 room, except for a gap at the right side.
func wallWithGap() *grid {
	room := floorRect{MinX: 0, MinZ: 0, MaxX: 8, MaxZ: 8}
	wall := floorRect{MinX: 0, MinZ: 3.5, MaxX: 5.5, MaxZ: 4.5}
	return newGrid(room, []floorRect{wall}, 0.5)
}

func TestFindPathWalksAroundAWall(t *testing.T) {
	floor := wallWithGap()
	from := floorPoint{X: 2, Z: 1}
	goal := floorPoint{X: 2, Z: 7}
	path := floor.findPath(from, goal)
	if len(path) < 2 {
		t.Fatalf("the wall needs a detour, got %v", path)
	}
	if path[len(path)-1] != goal {
		t.Fatalf("the path ends at %v", path[len(path)-1])
	}
	last := from
	for _, waypoint := range path {
		if !floor.hasLineOfSight(last, waypoint) {
			t.Fatalf("the part from %v to %v crosses the wall", last, waypoint)
		}
		last = waypoint
	}
}

func TestFindPathGoesStraightWithoutObstacle(t *testing.T) {
	floor := wallWithGap()
	goal := floorPoint{X: 6, Z: 1}
	path := floor.findPath(floorPoint{X: 1, Z: 1}, goal)
	if len(path) != 1 || path[0] != goal {
		t.Fatalf("path = %v", path)
	}
}

func TestFindPathEndsCloseToAnUnreachableGoal(t *testing.T) {
	room := floorRect{MinX: 0, MinZ: 0, MaxX: 8, MaxZ: 8}
	wall := floorRect{MinX: 0, MinZ: 3.5, MaxX: 8, MaxZ: 4.5}
	floor := newGrid(room, []floorRect{wall}, 0.5)
	path := floor.findPath(floorPoint{X: 2, Z: 1}, floorPoint{X: 2, Z: 7})
	end := path[len(path)-1]
	if end.Z > 3.1 || end.Z < 2 || !floor.isWalkable(end) {
		t.Fatalf("the path ends at %v", end)
	}
}

func TestFindPathStepsOutOfABlockedStart(t *testing.T) {
	floor := wallWithGap()
	path := floor.findPath(floorPoint{X: 2, Z: 4}, floorPoint{X: 2, Z: 1})
	if !floor.isWalkable(path[0]) {
		t.Fatalf("the first step %v is still blocked", path[0])
	}
}

func TestFindNearestWalkableKeepsAFreePoint(t *testing.T) {
	floor := wallWithGap()
	free := floorPoint{X: 2, Z: 1}
	if floor.findNearestWalkable(free) != free {
		t.Fatal("a free point stays")
	}
	moved := floor.findNearestWalkable(floorPoint{X: 2, Z: 4})
	if !floor.isWalkable(moved) {
		t.Fatalf("got %v", moved)
	}
}

// testFrame is the old fixed room of 21 by 40 floor units, where one unit is one meter.
func testFrame() floorFrame {
	return newFloorFrame(rules.Room{WidthMeters: 21, DepthMeters: 40, JellyMeters: unitsPerJelly})
}

func TestPointsSurviveTheWayToTheFloorAndBack(t *testing.T) {
	frame := testFrame()
	point := Point{X: 25, Y: 80}
	if got := frame.toPoint(frame.toFloorPoint(point)); got != point {
		t.Fatalf("got %v", got)
	}
	center := frame.toFloorPoint(Point{X: 50, Y: 50})
	if center.X != 0 || center.Z != 0 {
		t.Fatalf("center = %v", center)
	}
}

func TestObstaclesAreOnlyWhatBlocks(t *testing.T) {
	obstacles := listObstacles([]rules.Area{
		{X: 10, Y: 10, Width: 10, Height: 2, Kind: rules.AreaKindNone, Blocks: true, Prop: "desk"},
		{
			X:      22.5,
			Y:      1.75,
			Width:  20,
			Height: 0.5,
			Kind:   rules.AreaKindStage,
			Blocks: true,
			Prop:   "",
		},
		{X: 5, Y: 1, Width: 90, Height: 8, Kind: rules.AreaKindStage, Blocks: false, Prop: ""},
		{
			X:      50,
			Y:      10,
			Width:  10,
			Height: 2,
			Kind:   rules.AreaKindNone,
			Blocks: false,
			Prop:   "cable",
		},
	}, testFrame())
	if len(obstacles) != 2 {
		t.Fatalf("got %d obstacles", len(obstacles))
	}
}
