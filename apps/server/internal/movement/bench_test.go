package movement_test

import (
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const (
	benchJellies = 300
	benchSeconds = 60
)

// benchRoster seats many jellies in rows of desks, close to a LAN.
func benchRoster(room rules.Room) movement.Roster {
	seats := rules.Area{X: 5, Y: 30, Width: 90, Height: 60, Kind: rules.AreaKindSeats}
	roster := movement.Roster{WalkSpeed: rules.DefaultRules().WalkSpeed, Room: room}
	for row := range 6 {
		roster.Areas = append(roster.Areas, rules.Area{
			X:      10,
			Y:      35 + float64(row)*9,
			Width:  80,
			Height: 2,
			Kind:   rules.AreaKindNone,
			Blocks: true,
		})
	}
	roster.Areas = append(roster.Areas, seats)
	meters := rules.RoomMeters{Width: room.WidthMeters, Depth: room.DepthMeters}
	for index := range benchJellies {
		home := rules.CalculateHomeSpot(seats, index, meters)
		roster.Players = append(roster.Players, movement.Player{
			ID: int64(index + 1), Area: seats, Home: movement.Point{X: home.X, Y: home.Y},
		})
	}
	return roster
}

// benchmarkAdvance lets the jellies walk for a minute, one advance per second as on the server.
func benchmarkAdvance(b *testing.B, room rules.Room) {
	b.Helper()
	roster := benchRoster(room)
	for b.Loop() {
		planner := movement.NewPlanner()
		for second := range int64(benchSeconds) {
			planner.Advance(start+second*1000, roster)
		}
	}
}

func BenchmarkAdvanceOldRoom(b *testing.B) {
	benchmarkAdvance(b, testRoom())
}

func BenchmarkAdvanceHallInMeters(b *testing.B) {
	benchmarkAdvance(b, rules.DescribeRoom(rules.DefaultRules().PublicRules))
}
