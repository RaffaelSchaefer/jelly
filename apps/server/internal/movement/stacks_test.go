package movement_test

import (
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

func TestTripToAStackEndsOnItAndOtherTripsKeepTheirSpace(t *testing.T) {
	stack := movement.Point{X: 40, Y: 25}
	beside := movement.Point{X: 41, Y: 25}
	roster := makeRoster(1)
	lounge := roster.Players[0].Area
	roster.Players[0].Stack = &movement.StackPlace{Point: stack, Level: 0}
	// A crowd stands around the stack, so no free spot is left close to it.
	for playerID := int64(2); playerID <= 14; playerID++ {
		roster.Players = append(roster.Players, movement.Player{
			ID: playerID, Area: lounge, Home: beside, Trip: &beside,
		})
	}
	climber := movement.Player{ID: 20, Area: lounge, Home: movement.Point{X: 20, Y: 20}}
	roster.Players = append(roster.Players, climber)
	planner := movement.NewPlanner()
	planner.Advance(start, roster)
	// An app sends the point back, and its last digit may have been rounded on the way.
	rounded := movement.Point{X: stack.X + 1e-9, Y: stack.Y - 1e-9}
	roster.Players[len(roster.Players)-1].Trip = &rounded
	visitor := movement.Player{ID: 30, Area: lounge, Home: beside, Trip: &beside}
	roster.Players = append(roster.Players, visitor)
	planner.Advance(start+1000, roster)
	arrived := start + 10*60*1000
	reach := rules.DefaultRules().NearDistance
	if distance, _ := planner.MeasureDistanceTo(20, stack, arrived); distance > reach {
		t.Errorf("the climber ends %.2f m from the stack, more than %.2f m", distance, reach)
	}
	// One meter is one floor unit in the test room, so the personal space is 1.8 meters.
	for _, other := range roster.Players[:len(roster.Players)-1] {
		if distance, _ := planner.MeasureDistance(30, other.ID, arrived); distance < 1.8 {
			t.Errorf("a trip next to jelly %d ends only %.2f m away", other.ID, distance)
		}
	}
}
