package store_test

import (
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const (
	benchPlayers  = 70
	benchJoinCode = "bench-code"
)

// openBenchStore creates a running LAN with 70 players, the size of the real event.
func openBenchStore(b *testing.B) (*store.Store, []int64, int64) {
	b.Helper()
	database, err := store.Open(b.Context(), filepath.Join(b.TempDir(), "jelly.db"))
	if err != nil {
		b.Fatal(err)
	}
	b.Cleanup(func() { _ = database.Close() })
	startsAt := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)
	err = database.CreateLAN(b.Context(), store.NewLAN{
		Slug: "bench", Name: "Bench", Timezone: "Europe/Berlin", JoinCode: benchJoinCode,
		StartsAt: startsAt.UnixMilli(), EndsAt: startsAt.Add(96 * time.Hour).UnixMilli(),
		Rules: rules.DefaultRules(),
	})
	if err != nil {
		b.Fatal(err)
	}
	now := startsAt.Add(time.Hour).UnixMilli()
	playerIDs := make([]int64, 0, benchPlayers)
	for index := range benchPlayers {
		_, state, err := database.RedeemCode(b.Context(), store.RedeemRequest{
			Code: benchJoinCode, Name: "Bench" + strconv.Itoa(index), Color: "mint",
		}, now)
		if err != nil {
			b.Fatal(err)
		}
		playerIDs = append(playerIDs, state.ID)
	}
	return database, playerIDs, now
}

func BenchmarkApplyPoke(b *testing.B) {
	database, playerIDs, now := openBenchStore(b)
	index := 0
	for b.Loop() {
		index++
		playerID := playerIDs[index%len(playerIDs)]
		_, _, err := database.ApplyPoke(b.Context(), playerID, now+int64(index))
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkLoadStageState(b *testing.B) {
	database, _, now := openBenchStore(b)
	for b.Loop() {
		state, err := database.LoadStageState(b.Context(), now)
		if err != nil {
			b.Fatal(err)
		}
		if len(state.Players) != benchPlayers {
			b.Fatalf("stage has %d jellies", len(state.Players))
		}
	}
}

func BenchmarkListEventsAfter(b *testing.B) {
	database, _, _ := openBenchStore(b)
	for b.Loop() {
		_, err := database.ListEventsAfter(b.Context(), 0)
		if err != nil {
			b.Fatal(err)
		}
	}
}
