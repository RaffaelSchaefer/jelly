package movement_test

import (
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const start = int64(1_000_000)

// makeRoster puts jellies with these IDs into a large lounge with a desk row behind it.
func makeRoster(playerIDs ...int64) movement.Roster {
	lounge := rules.Area{X: 10, Y: 10, Width: 60, Height: 30, Kind: rules.AreaKindLounge}
	desk := rules.Area{X: 0, Y: 45, Width: 80, Height: 3, Kind: rules.AreaKindDesk}
	roster := movement.Roster{Areas: []rules.Area{lounge, desk}}
	for index, playerID := range playerIDs {
		roster.Players = append(roster.Players, movement.Player{
			ID: playerID, Area: lounge,
			Home: movement.Point{X: 20 + 8*float64(index), Y: 20},
		})
	}
	return roster
}

// findMove returns the latest move of jelly 1.
func findMove(t *testing.T, planner *movement.Planner) movement.Move {
	t.Helper()
	for _, move := range planner.ListCurrentMoves() {
		if move.PlayerID == 1 {
			return move
		}
	}
	t.Fatal("jelly 1 has no move")
	return movement.Move{}
}

// endOf returns where a move ends.
func endOf(move movement.Move) movement.Point {
	return move.Points[len(move.Points)-1].Point
}

func TestANewJellyStandsAtItsPlace(t *testing.T) {
	planner := movement.NewPlanner()
	planner.Advance(start, makeRoster(1))
	move := findMove(t, planner)
	if move.Kind != movement.KindWander || len(move.Points) != 1 {
		t.Fatalf("move = %+v", move)
	}
	if endOf(move) != (movement.Point{X: 20, Y: 20}) {
		t.Fatalf("stands at %+v", endOf(move))
	}
}

func TestJellyWandersOnAfterAPauseAndStaysInItsArea(t *testing.T) {
	planner := movement.NewPlanner()
	roster := makeRoster(1)
	planner.Advance(start, roster)
	moves := 0
	last := findMove(t, planner)
	for second := range int64(300) {
		planner.Advance(start+second*1000, roster)
		move := findMove(t, planner)
		if move.StartAt == last.StartAt {
			continue
		}
		moves++
		last = move
		if move.StartAt <= start+second*1000 {
			t.Fatal("a move starts in the future, so every screen gets it in time")
		}
		end := endOf(move)
		if end.X < 10 || end.X > 70 || end.Y < 10 || end.Y > 40 {
			t.Fatalf("left its area: %+v", end)
		}
	}
	if moves < 5 {
		t.Fatalf("only %d moves in five minutes", moves)
	}
}

func TestTwoJellyGoalsKeepTheirDistance(t *testing.T) {
	planner := movement.NewPlanner()
	roster := makeRoster(1, 2)
	roster.Players[1].Home = roster.Players[0].Home
	planner.Advance(start, roster)
	distance, ok := planner.MeasureDistance(1, 2, start)
	if !ok || distance < 1.7 {
		t.Fatalf("distance = %v", distance)
	}
}

func TestTripWalksAroundTheDeskAndEndsAtThePoint(t *testing.T) {
	planner := movement.NewPlanner()
	roster := makeRoster(1)
	planner.Advance(start, roster)
	roster.Players[0].Trip = &movement.Point{X: 50, Y: 60}
	planner.Advance(start+1000, roster)
	move := findMove(t, planner)
	if move.Kind != movement.KindTrip {
		t.Fatalf("kind = %s", move.Kind)
	}
	if len(move.Points) < 3 {
		t.Fatalf("the desk row needs a detour: %+v", move.Points)
	}
	if endOf(move) != (movement.Point{X: 50, Y: 60}) {
		t.Fatalf("ends at %+v", endOf(move))
	}
	duration := move.Points[len(move.Points)-1].T
	if duration <= 0 || duration > 13000 {
		t.Fatalf("takes %d ms", duration)
	}
}

func TestEndOfTripWalksHome(t *testing.T) {
	planner := movement.NewPlanner()
	roster := makeRoster(1)
	planner.Advance(start, roster)
	roster.Players[0].Trip = &movement.Point{X: 50, Y: 60}
	planner.Advance(start+1000, roster)
	roster.Players[0].Trip = nil
	planner.Advance(start+60_000, roster)
	move := findMove(t, planner)
	if move.Kind != movement.KindWander || endOf(move) != (movement.Point{X: 20, Y: 20}) {
		t.Fatalf("move = %+v", move)
	}
}

func TestFollowerWalksBesideItsTargetAndComesAlong(t *testing.T) {
	planner := movement.NewPlanner()
	roster := makeRoster(1, 2)
	planner.Advance(start, roster)
	roster.Players[0].FollowID = 2
	planner.Advance(start+1000, roster)
	if kind := findMove(t, planner).Kind; kind != movement.KindFollow {
		t.Fatalf("kind = %s", kind)
	}
	roster.Players[1].Trip = &movement.Point{X: 60, Y: 35}
	planner.Advance(start+60_000, roster)
	planner.Advance(start+61_000, roster)
	end := endOf(findMove(t, planner))
	if end.X < 45 || end.Y < 25 {
		t.Fatalf("the follower stayed behind at %+v", end)
	}
}

func TestFollowingEndsWhenTheTargetLeaves(t *testing.T) {
	planner := movement.NewPlanner()
	roster := makeRoster(1, 2)
	roster.Players[0].FollowID = 2
	planner.Advance(start, roster)
	roster.Players = roster.Players[:1]
	planner.Advance(start+1000, roster)
	if kind := findMove(t, planner).Kind; kind != movement.KindWander {
		t.Fatalf("kind = %s", kind)
	}
}

func TestSnackRunGoesToTheCounterAndBack(t *testing.T) {
	planner := movement.NewPlanner()
	roster := makeRoster(1)
	bar := rules.Area{X: 60, Y: 60, Width: 20, Height: 3, Kind: rules.AreaKindSnackbar}
	roster.Areas = append(roster.Areas, bar)
	planner.Advance(start, roster)
	roster.Players[0].SnackUntil = start + 14_000
	planner.Advance(start+1000, roster)
	move := findMove(t, planner)
	if move.Kind != movement.KindSnack {
		t.Fatalf("kind = %s", move.Kind)
	}
	end := endOf(move)
	if end.X < 60 || end.X > 80 || end.Y > 60 {
		t.Fatalf("waits at %+v", end)
	}
	planner.Advance(start+14_000, roster)
	if kind := findMove(t, planner).Kind; kind != movement.KindWander {
		t.Fatalf("kind = %s", kind)
	}
}

func TestPositionFollowsTheRouteOverTime(t *testing.T) {
	planner := movement.NewPlanner()
	roster := makeRoster(1)
	planner.Advance(start, roster)
	roster.Players[0].Trip = &movement.Point{X: 60, Y: 20}
	planner.Advance(start+1000, roster)
	move := findMove(t, planner)
	before, _ := planner.FindPosition(1, move.StartAt)
	last := move.Points[len(move.Points)-1]
	middle, _ := planner.FindPosition(1, move.StartAt+last.T/2)
	after, _ := planner.FindPosition(1, move.StartAt+last.T+1000)
	if !(before.X < middle.X && middle.X < after.X) {
		t.Fatalf("positions %v %v %v", before, middle, after)
	}
	if after != last.Point {
		t.Fatalf("stands at %+v", after)
	}
}

func TestStreamsReceiveEachMoveOnce(t *testing.T) {
	planner := movement.NewPlanner()
	roster := makeRoster(1, 2)
	planner.Advance(start, roster)
	first, number := planner.ListMovesAfter(0)
	if len(first) != 2 {
		t.Fatalf("a new stream gets all jellies, got %d", len(first))
	}
	none, same := planner.ListMovesAfter(number)
	if len(none) != 0 || same != number {
		t.Fatalf("got %d moves, number %d", len(none), same)
	}
	roster.Players[0].Trip = &movement.Point{X: 50, Y: 20}
	planner.Advance(start+1000, roster)
	moves, next := planner.ListMovesAfter(number)
	if len(moves) != 1 || moves[0].PlayerID != 1 || next != number+1 {
		t.Fatalf("got %+v, number %d", moves, next)
	}
}

func TestMovesAreClaimedOncePerInterval(t *testing.T) {
	planner := movement.NewPlanner()
	if !planner.ClaimAdvance(start) {
		t.Fatal("the first claim wins")
	}
	if planner.ClaimAdvance(start + 500) {
		t.Fatal("too early")
	}
	if !planner.ClaimAdvance(start + 1000) {
		t.Fatal("due again")
	}
}

func TestJellyLeavingTheStageIsForgotten(t *testing.T) {
	planner := movement.NewPlanner()
	roster := makeRoster(1, 2)
	planner.Advance(start, roster)
	roster.Players = roster.Players[:1]
	planner.Advance(start+1000, roster)
	if _, ok := planner.FindPosition(2, start+1000); ok {
		t.Fatal("jelly 2 left")
	}
}
