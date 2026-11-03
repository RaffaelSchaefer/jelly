package store_test

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/pressly/goose/v3"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

func openStore(t *testing.T) *store.Store {
	t.Helper()
	database, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "jelly.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

// Opening twice must not apply a migration again.
func TestOpenIsRepeatable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "jelly.db")
	for range 2 {
		database, err := store.Open(t.Context(), path)
		if err != nil {
			t.Fatal(err)
		}
		if err := database.Close(); err != nil {
			t.Fatal(err)
		}
	}
}

// Every migration must apply, roll back and apply again.
func TestMigrationsRollBack(t *testing.T) {
	database, err := sql.Open("sqlite", "file:"+filepath.Join(t.TempDir(), "jelly.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	provider, err := goose.NewProvider(goose.DialectSQLite3, database, os.DirFS("migrations"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.Up(t.Context()); err != nil {
		t.Fatalf("first up: %v", err)
	}
	if _, err := provider.DownTo(t.Context(), 0); err != nil {
		t.Fatalf("down: %v", err)
	}
	if _, err := provider.Up(t.Context()); err != nil {
		t.Fatalf("second up: %v", err)
	}
}

// A cancelled parent context must reach reads and writes through their derived contexts.
func TestCancelledContextStopsDatabaseWork(t *testing.T) {
	database := openStore(t)
	cancelledCtx, cancel := context.WithCancel(t.Context())
	cancel()

	if err := database.PingDatabase(cancelledCtx); !errors.Is(err, context.Canceled) {
		t.Errorf("PingDatabase() = %v, want context.Canceled", err)
	}
	_, err := database.FindPlayerByToken(cancelledCtx, "token")
	if !errors.Is(err, context.Canceled) {
		t.Errorf("FindPlayerByToken() = %v, want context.Canceled", err)
	}
	_, err = database.LoadPlayerState(cancelledCtx, 1, 0)
	if !errors.Is(err, context.Canceled) {
		t.Errorf("LoadPlayerState() = %v, want context.Canceled", err)
	}
	startsAt := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)
	err = database.CreateLAN(cancelledCtx, store.NewLAN{
		Slug: "cancelled", Name: "Cancelled", Timezone: "UTC", JoinCode: "code",
		StartsAt: startsAt.UnixMilli(), EndsAt: startsAt.Add(time.Hour).UnixMilli(),
		Rules: rules.DefaultRules(),
	})
	if !errors.Is(err, context.Canceled) {
		t.Errorf("CreateLAN() = %v, want context.Canceled", err)
	}
}

func TestLoadCurrentRulesFallsBackToTheDefaultsBetweenLANs(t *testing.T) {
	database, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "jelly.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	got, err := database.LoadCurrentRules(t.Context(), 1000)
	if err != nil {
		t.Fatal(err)
	}
	if got != rules.DefaultRules() {
		t.Errorf("rules = %+v", got)
	}
}
