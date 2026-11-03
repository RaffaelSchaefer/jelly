package simulator_test

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/simulator"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const (
	testJoinCode = "simulator-code"
	testStageKey = "simulator-stage"
	testPlayers  = 6
)

func startServer(t *testing.T) (*httptest.Server, *store.Store) {
	t.Helper()
	database, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "jelly.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	now := time.Now()
	err = database.CreateLAN(t.Context(), store.NewLAN{
		Slug: "sim", Name: "Sim", Timezone: "Europe/Berlin", JoinCode: testJoinCode,
		StartsAt: now.Add(-time.Hour).UnixMilli(), EndsAt: now.Add(time.Hour).UnixMilli(),
		Rules: rules.DefaultRules(),
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(api.NewHandler(api.Dependencies{
		Store: database, Now: time.Now, Logger: slog.New(slog.DiscardHandler),
		StageKey: testStageKey, AdminSecret: "admin", IsStopping: func() bool { return false },
		Web: nil,
	}))
	t.Cleanup(server.Close)
	return server, database
}

func TestRunFillsTheStage(t *testing.T) {
	server, database := startServer(t)
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()

	config := buildTestConfig(server.URL, testJoinCode)
	stats, err := simulator.Run(ctx, server.Client(), config, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	hasProblem := stats.FailedActions != 0 || stats.DeadBots != 0
	if stats.Accepted == 0 || hasProblem || stats.MeanLatency <= 0 {
		t.Fatalf("stats: %+v", stats)
	}

	request, err := http.NewRequestWithContext(t.Context(), http.MethodGet,
		server.URL+"/v1/state?key="+testStageKey, http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	var stage store.StageState
	err = json.NewDecoder(response.Body).Decode(&stage)
	if err != nil {
		t.Fatal(err)
	}
	if len(stage.Players) != testPlayers {
		t.Fatalf("stage has %d jellies", len(stage.Players))
	}
	events, err := database.ListEventsAfter(t.Context(), 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) == 0 {
		t.Fatal("no events")
	}
}

func buildTestConfig(baseURL, joinCode string) simulator.Config {
	return simulator.Config{
		BaseURL: baseURL, JoinCode: joinCode, RunID: simulator.GenerateRunID(),
		Players: testPlayers, MinDelay: 5 * time.Millisecond, MaxDelay: 20 * time.Millisecond,
		Now: time.Now,
	}
}

func TestRunReportsWhyNoBotCouldRegister(t *testing.T) {
	server, _ := startServer(t)
	config := buildTestConfig(server.URL, "wrong-code")
	stats, err := simulator.Run(t.Context(), server.Client(), config, slog.New(slog.DiscardHandler))
	if err == nil || !strings.Contains(err.Error(), "status 403") {
		t.Fatalf("the cause is hidden: %v", err)
	}
	if stats.DeadBots != testPlayers || stats.FailedActions != 0 {
		t.Fatalf("stats: %+v", stats)
	}
}

func TestRunAcceptsATrailingSlash(t *testing.T) {
	server, _ := startServer(t)
	ctx, cancel := context.WithTimeout(t.Context(), 300*time.Millisecond)
	defer cancel()
	config := buildTestConfig(server.URL+"/", testJoinCode)
	stats, err := simulator.Run(ctx, server.Client(), config, slog.New(slog.DiscardHandler))
	if err != nil || stats.DeadBots != 0 {
		t.Fatalf("stats: %+v, error: %v", stats, err)
	}
}

func TestValidateConfig(t *testing.T) {
	valid := buildTestConfig("http://localhost:8080", testJoinCode)
	if err := simulator.ValidateConfig(valid); err != nil {
		t.Fatalf("valid config: %v", err)
	}
	testCases := []struct {
		name   string
		change func(*simulator.Config)
	}{
		{"no scheme", func(config *simulator.Config) { config.BaseURL = "localhost:8080" }},
		{"no host", func(config *simulator.Config) { config.BaseURL = "http://" }},
		{"other scheme", func(config *simulator.Config) { config.BaseURL = "ftp://host" }},
		{"no players", func(config *simulator.Config) { config.Players = 0 }},
		{"too many players", func(config *simulator.Config) { config.Players = 100_000 }},
		{"no delay", func(config *simulator.Config) { config.MinDelay = 0 }},
		{"swapped delays", func(config *simulator.Config) { config.MaxDelay = time.Nanosecond }},
		{"no join code", func(config *simulator.Config) { config.JoinCode = "" }},
		{"no clock", func(config *simulator.Config) { config.Now = nil }},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			config := valid
			testCase.change(&config)
			err := simulator.ValidateConfig(config)
			if !errors.Is(err, simulator.ErrInvalidConfig) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func TestGenerateRunIDDiffers(t *testing.T) {
	first := simulator.GenerateRunID()
	second := simulator.GenerateRunID()
	if first == second {
		t.Fatalf("two runs in one second must not share names: %s", first)
	}
}
