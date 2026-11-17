package rules_test

import (
	"errors"
	"math"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// testRoom has the shape of the old fixed room of 21 by 40, for which these cases were written.
func testRoom() rules.RoomMeters {
	return rules.RoomMeters{Width: 21, Depth: 40}
}

func TestValidateAreaChecksTheRotatedCorners(t *testing.T) {
	cases := []struct {
		name string
		area rules.Area
		want bool
	}{
		{"any angle", rules.Area{X: 40, Y: 40, Width: 20, Height: 20, Rotation: 37.5}, true},
		{"last degree", rules.Area{X: 40, Y: 40, Width: 20, Height: 20, Rotation: 359.9}, true},
		{"negative", rules.Area{X: 40, Y: 40, Width: 20, Height: 20, Rotation: -1}, false},
		{"full turn", rules.Area{X: 40, Y: 40, Width: 20, Height: 20, Rotation: 360}, false},
		{
			"not a number",
			rules.Area{X: 40, Y: 40, Width: 20, Height: 20, Rotation: math.NaN()},
			false,
		},
		{"corner leaves", rules.Area{X: 0, Y: 0, Width: 10, Height: 10, Rotation: 45}, false},
		// 150 percent of the width are 31.5 units, which fit along the depth of 40.
		{"fits turned", rules.Area{X: -25, Y: 45, Width: 150, Height: 10, Rotation: 90}, true},
		{"too long unturned", rules.Area{X: -25, Y: 45, Width: 150, Height: 10}, false},
		// A half turn lands right on the walls, up to the rounding of the sine.
		{"touches a wall", rules.Area{X: 0, Y: 0, Width: 100, Height: 100, Rotation: 180}, true},
	}
	for _, testCase := range cases {
		testCase.area.Kind = rules.AreaKindNone
		err := rules.ValidateArea(testCase.area, testRoom())
		if testCase.want != (err == nil) {
			t.Errorf("%s: %v", testCase.name, err)
		}
		if err != nil && !errors.Is(err, rules.ErrInvalidArea) {
			t.Errorf("%s: wrong error %v", testCase.name, err)
		}
	}
}

func TestFreeFloorFollowsTheRotationOfABlockingZone(t *testing.T) {
	// 8.4 units wide and 2 deep. Turned, it runs along the depth of the room.
	table := rules.Area{X: 30, Y: 45, Width: 40, Height: 5, Rotation: 90, Blocks: true}
	areas := []rules.Area{table}
	cases := []struct {
		name  string
		point rules.StagePoint
		want  bool
	}{
		{"middle", rules.StagePoint{X: 50, Y: 47.5}, false},
		{"far end of the turned table", rules.StagePoint{X: 50, Y: 57}, false},
		{"where it would stand unturned", rules.StagePoint{X: 65, Y: 47.5}, true},
		{"beside the turned table", rules.StagePoint{X: 56, Y: 47.5}, true},
	}
	for _, testCase := range cases {
		if got := rules.IsOnFreeFloor(testCase.point, areas, testRoom()); got != testCase.want {
			t.Errorf("%s: %v", testCase.name, got)
		}
	}
}

func TestHomeSpotsStayInsideARotatedArea(t *testing.T) {
	area := rules.Area{X: 30, Y: 40, Width: 40, Height: 12, Rotation: 30, Blocks: true}
	for place := range 200 {
		home := rules.CalculateHomeSpot(area, place, testRoom())
		point := rules.StagePoint(home)
		if rules.IsOnFreeFloor(point, []rules.Area{area}, testRoom()) {
			t.Fatalf("place %d lies outside at %+v", place, home)
		}
	}
}

func TestATurnGoesClockwiseSeenFromAbove(t *testing.T) {
	east := rules.NewTurn(90).Apply(rules.FloorOffset{X: 0, Z: -1})
	if math.Abs(east.X-1) > 1e-9 || math.Abs(east.Z) > 1e-9 {
		t.Fatalf("back of the room turned by 90 degrees: %+v", east)
	}
	turn := rules.NewTurn(37.5)
	back := turn.Undo(turn.Apply(rules.FloorOffset{X: 3, Z: 4}))
	if math.Abs(back.X-3) > 1e-9 || math.Abs(back.Z-4) > 1e-9 {
		t.Fatalf("back: %+v", back)
	}
}

func TestAMapZoneTakesItsRotationAlong(t *testing.T) {
	zone := rules.MapZone{ID: "sofa", X: 40, Y: 40, Width: 10, Height: 5, Rotation: 12.25}
	if got := zone.ToArea().Rotation; got != 12.25 {
		t.Fatalf("rotation %v", got)
	}
	zone.Rotation = 400
	if invalid := rules.ListInvalidMapZones([]rules.MapZone{zone}, testRoom()); len(invalid) != 1 {
		t.Fatalf("invalid: %v", invalid)
	}
}
