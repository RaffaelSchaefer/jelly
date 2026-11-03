package api_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const (
	joinCode    = "glibber-2026"
	pokeBody    = `{"action":"poke"}`
	stageKey    = "stage-key"
	adminSecret = "admin-secret"
)

// apiResponse is a response that was read completely.
type apiResponse struct {
	status int
	body   []byte
}

// registerResponse is the response of `POST /register`.
type registerResponse struct {
	Token string `json:"token"`
}

// pokeResponse is the response of `POST /actions`.
type pokeResponse struct {
	XPGained int `json:"xp_gained"`
}

// errorResponse is the uniform error response.
type errorResponse struct {
	Error struct {
		Code string `json:"code"`
	} `json:"error"`
}

// fixture is a server with a real database and a controllable clock.
type fixture struct {
	t        *testing.T
	handler  http.Handler
	database *store.Store
	path     string
	clock    atomic.Int64
	stopping atomic.Bool
}

func readLANStart() time.Time {
	return time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	testFixture := &fixture{t: t, path: filepath.Join(t.TempDir(), "jelly.db")}
	testFixture.clock.Store(readLANStart().Add(time.Hour).UnixMilli())
	testFixture.openDatabase()
	t.Cleanup(func() { _ = testFixture.database.Close() })
	testFixture.createLAN("ucb-2026", readLANStart())
	return testFixture
}

// openDatabase opens the database (again) and builds the handler.
func (testFixture *fixture) openDatabase() {
	testFixture.t.Helper()
	opened, err := store.Open(testFixture.t.Context(), testFixture.path)
	if err != nil {
		testFixture.t.Fatal(err)
	}
	testFixture.database = opened
	readClock := func() time.Time { return time.UnixMilli(testFixture.clock.Load()) }
	testFixture.handler = api.NewHandler(api.Dependencies{
		Store:       opened,
		Now:         readClock,
		Logger:      slog.New(slog.DiscardHandler),
		StageKey:    stageKey,
		AdminSecret: adminSecret,
		IsStopping:  testFixture.stopping.Load,
		Web:         nil,
	})
}

func (testFixture *fixture) createLAN(slug string, startsAt time.Time) {
	testFixture.t.Helper()
	err := testFixture.database.CreateLAN(testFixture.t.Context(), store.NewLAN{
		Slug: slug, Name: slug, Timezone: "Europe/Berlin", JoinCode: joinCode,
		StartsAt: startsAt.UnixMilli(), EndsAt: startsAt.Add(96 * time.Hour).UnixMilli(),
		Rules: rules.DefaultRules(),
	})
	if err != nil {
		testFixture.t.Fatal(err)
	}
}

func (testFixture *fixture) advanceClock(duration time.Duration) {
	testFixture.clock.Add(duration.Milliseconds())
}

func (testFixture *fixture) callAPI(method, path, token, body string) apiResponse {
	testFixture.t.Helper()
	request := httptest.NewRequestWithContext(
		testFixture.t.Context(), method, path, strings.NewReader(body),
	)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	recorder := httptest.NewRecorder()
	testFixture.handler.ServeHTTP(recorder, request)
	return apiResponse{status: recorder.Code, body: recorder.Body.Bytes()}
}

func buildRegisterBody(name, color string) string {
	return `{"code":"` + joinCode + `","name":"` + name + `","color":"` + color + `"}`
}

func (testFixture *fixture) registerPlayer(name string) string {
	testFixture.t.Helper()
	response := testFixture.callAPI("POST", "/v1/register", "", buildRegisterBody(name, "mint"))
	if response.status != http.StatusCreated {
		testFixture.t.Fatalf("register: %d %s", response.status, response.body)
	}
	return decodeBody[registerResponse](testFixture.t, response).Token
}

func (testFixture *fixture) pokePlayer(token string) int {
	testFixture.t.Helper()
	response := testFixture.callAPI("POST", "/v1/actions", token, pokeBody)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("poke: %d %s", response.status, response.body)
	}
	return decodeBody[pokeResponse](testFixture.t, response).XPGained
}

func (testFixture *fixture) loadMe(token string) store.PlayerState {
	testFixture.t.Helper()
	response := testFixture.callAPI("GET", "/v1/me", token, "")
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("load state: %d %s", response.status, response.body)
	}
	return decodeBody[store.PlayerState](testFixture.t, response)
}

func decodeBody[Target any](t *testing.T, response apiResponse) Target {
	t.Helper()
	var target Target
	if err := json.Unmarshal(response.body, &target); err != nil {
		t.Fatalf("response is not the expected JSON: %q", response.body)
	}
	return target
}

func requireProblem(t *testing.T, response apiResponse, status int, code string) {
	t.Helper()
	got := decodeBody[errorResponse](t, response).Error.Code
	if response.status != status || got != code {
		t.Fatalf("%d %s, want %d %s", response.status, response.body, status, code)
	}
}

func TestHealth(t *testing.T) {
	response := newFixture(t).callAPI("GET", "/health", "", "")
	if response.status != http.StatusOK || !strings.Contains(string(response.body), `"ok"`) {
		t.Fatalf("%d %s", response.status, response.body)
	}
}

func TestRegisterMePokeFlow(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("  Glibber ")

	state := testFixture.loadMe(token)
	if state.Name != "Glibber" || state.XP != 0 || state.Level != 1 || state.LANsAttended != 1 {
		t.Fatalf("state after registration: %+v", state)
	}
	if state.LAN == nil || !state.LAN.Active {
		t.Fatalf("entry is missing: %+v", state)
	}

	if got := testFixture.pokePlayer(token); got != 3 {
		t.Fatalf("first poke = %d XP, want 3", got)
	}
	if got := testFixture.pokePlayer(token); got != 0 {
		t.Fatalf("immediate second poke = %d XP, want 0", got)
	}
	testFixture.advanceClock(15*time.Minute - time.Second)
	if got := testFixture.pokePlayer(token); got != 0 {
		t.Fatalf("poke just too early = %d XP, want 0", got)
	}
	testFixture.advanceClock(time.Second)
	if got := testFixture.pokePlayer(token); got != 3 {
		t.Fatalf("poke after 15 minutes = %d XP, want 3", got)
	}

	state = testFixture.loadMe(token)
	want := testFixture.clock.Load() + (15 * time.Minute).Milliseconds()
	if state.XP != 6 || state.NextPokeAt == nil || *state.NextPokeAt != want {
		t.Fatalf("state after pokes: %+v, want next poke at %d", state, want)
	}
}

func TestRegisterRejections(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.registerPlayer("Glibber")
	testCases := []struct {
		name, body, code string
		status           int
	}{
		{"wrong code", `{"code":"no","name":"A","color":"mint"}`, "invalid_code", 403},
		{"name taken", buildRegisterBody("glibber", "mint"), "name_taken", 409},
		{"empty name", buildRegisterBody("  ", "mint"), "invalid_name", 400},
		{"unknown color", buildRegisterBody("B", "red"), "invalid_color", 400},
		{"unknown field", `{"code":"x","name":"C","color":"mint","xp":9}`, "invalid_body", 422},
		{"two objects", `{"code":"x","name":"D","color":"mint"}{}`, "invalid_body", 400},
		{"no JSON", `nope`, "invalid_body", 400},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			response := testFixture.callAPI("POST", "/v1/register", "", testCase.body)
			requireProblem(t, response, testCase.status, testCase.code)
		})
	}
}

func TestAuthRequired(t *testing.T) {
	testFixture := newFixture(t)
	for _, token := range []string{"", "wrong"} {
		response := testFixture.callAPI("GET", "/v1/me", token, "")
		requireProblem(t, response, http.StatusUnauthorized, "unauthorized")
	}
}

func TestUnknownAction(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	response := testFixture.callAPI("POST", "/v1/actions", token, `{"action":"xp"}`)
	requireProblem(t, response, http.StatusBadRequest, "unknown_action")
}

func TestNoActiveLAN(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.pokePlayer(token)
	testFixture.advanceClock(200 * time.Hour)

	response := testFixture.callAPI("POST", "/v1/actions", token, pokeBody)
	requireProblem(t, response, http.StatusConflict, "no_active_lan")
	response = testFixture.callAPI("POST", "/v1/register", "", buildRegisterBody("B", "mint"))
	requireProblem(t, response, http.StatusConflict, "no_active_lan")

	// The last state stays readable while no LAN is running.
	state := testFixture.loadMe(token)
	if state.XP != 3 || state.LAN == nil || state.LAN.Active || state.NextPokeAt != nil {
		t.Fatalf("state after the LAN: %+v", state)
	}
}

func TestOldAccountCannotPokeInNewLANWithoutJoining(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.pokePlayer(token)

	nextLANStart := readLANStart().AddDate(1, 0, 0)
	testFixture.createLAN("ucb-2027", nextLANStart)
	testFixture.clock.Store(nextLANStart.Add(time.Hour).UnixMilli())

	response := testFixture.callAPI("POST", "/v1/actions", token, pokeBody)
	requireProblem(t, response, http.StatusConflict, "not_joined")
}

func TestLANOverlapRejected(t *testing.T) {
	testFixture := newFixture(t)
	startsAt := readLANStart().Add(time.Hour)
	err := testFixture.database.CreateLAN(t.Context(), store.NewLAN{
		Slug: "duplicate", Name: "Duplicate", Timezone: "Europe/Berlin", JoinCode: "x",
		StartsAt: startsAt.UnixMilli(), EndsAt: startsAt.Add(time.Hour).UnixMilli(),
		Rules: rules.DefaultRules(),
	})
	if !errors.Is(err, store.ErrLANOverlap) {
		t.Fatalf("overlap: %v", err)
	}
}

// Simultaneous pokes grant XP only once in total.
func TestConcurrentPokesGrantOnce(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	var grantedXP atomic.Int64
	var waitGroup sync.WaitGroup
	for range 32 {
		waitGroup.Go(func() {
			response := testFixture.callAPI("POST", "/v1/actions", token, pokeBody)
			var poke pokeResponse
			if err := json.Unmarshal(response.body, &poke); err != nil {
				t.Errorf("response: %q", response.body)
				return
			}
			grantedXP.Add(int64(poke.XPGained))
		})
	}
	waitGroup.Wait()
	if grantedXP.Load() != 3 {
		t.Fatalf("%d XP in total, want 3", grantedXP.Load())
	}
}

func TestStatePersistsAcrossRestart(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.pokePlayer(token)

	if err := testFixture.database.Close(); err != nil {
		t.Fatal(err)
	}
	testFixture.openDatabase()

	if state := testFixture.loadMe(token); state.XP != 3 {
		t.Fatalf("state after restart: %+v", state)
	}
	if got := testFixture.pokePlayer(token); got != 0 {
		t.Fatalf("interval did not survive the restart: %d XP", got)
	}
}

func TestTokenIsNotStoredInPlaintext(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	database, err := sql.Open("sqlite", "file:"+testFixture.path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	var storedHash string
	row := database.QueryRowContext(t.Context(), `SELECT token_hash FROM players`)
	if err := row.Scan(&storedHash); err != nil {
		t.Fatal(err)
	}
	if storedHash == "" || strings.Contains(storedHash, token) {
		t.Fatalf("token is not stored as a hash: %q", storedHash)
	}
}

func TestCancelledRequestIsNoServerError(t *testing.T) {
	testFixture := newFixture(t)
	logs := &bytes.Buffer{}
	handler := api.NewHandler(api.Dependencies{
		Store: testFixture.database, Now: time.Now,
		Logger:   slog.New(slog.NewTextHandler(logs, nil)),
		StageKey: stageKey, AdminSecret: adminSecret,
		IsStopping: testFixture.stopping.Load, Web: nil,
	})
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	request := httptest.NewRequestWithContext(ctx, http.MethodGet, "/v1/me", http.NoBody)
	request.Header.Set("Authorization", "Bearer some-token")
	handler.ServeHTTP(httptest.NewRecorder(), request)
	if strings.Contains(logs.String(), "level=ERROR") {
		t.Fatalf("a client that left must not look like a server error: %s", logs)
	}
}
