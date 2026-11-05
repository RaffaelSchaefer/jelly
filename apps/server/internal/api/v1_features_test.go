package api_test

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

func TestServerStartsWithItsPages(t *testing.T) {
	testFixture := newFixture(t)
	pages := http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusTeapot)
	})
	handler := api.NewHandler(api.Dependencies{
		Store: testFixture.database, Now: time.Now, Logger: slog.New(slog.DiscardHandler),
		StageKey: stageKey, AdminSecret: adminSecret, IsStopping: func() bool { return false },
		Web: pages,
	})
	for path, status := range map[string]int{
		"/stage/": http.StatusTeapot, "/v1/nope": http.StatusNotFound, "/health": http.StatusOK,
	} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, http.NoBody)
		handler.ServeHTTP(recorder, request)
		if recorder.Code != status {
			t.Errorf("%s: status %d, want %d", path, recorder.Code, status)
		}
	}
}

func TestCurrentLANWorksWithoutAnAccount(t *testing.T) {
	testFixture := newFixture(t)
	status := decodeBody[store.LANStatus](t, testFixture.callAPI("GET", "/v1/lans/current", "", ""))
	if status.Current == nil || status.Current.Slug != "ucb-2026" || status.Joined != nil {
		t.Fatalf("status = %+v", status)
	}
	if status.ServerTime != testFixture.clock.Load() || status.Next != nil {
		t.Fatalf("status = %+v", status)
	}
	token := testFixture.registerPlayer("A")
	status = decodeBody[store.LANStatus](t, testFixture.callAPI("GET", "/v1/lans/current",
		token, ""))
	if status.Joined == nil || !*status.Joined {
		t.Fatalf("joined = %v", status.Joined)
	}
	requireProblem(t, testFixture.callAPI("GET", "/v1/lans/current", "wrong", ""),
		http.StatusUnauthorized, "unauthorized")
}

func TestCurrentLANKnowsTheNextOne(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.createLAN("next", readLANStart().Add(240*time.Hour))
	testFixture.advanceClock(-2 * time.Hour)
	status := decodeBody[store.LANStatus](t, testFixture.callAPI("GET", "/v1/lans/current", "", ""))
	if status.Current != nil || status.Next == nil || status.Next.Slug != "ucb-2026" {
		t.Fatalf("status = %+v", status)
	}
}

func TestStateCarriesClockAndStreamPosition(t *testing.T) {
	testFixture := newFixture(t)
	state := testFixture.loadMe(testFixture.registerPlayer("A"))
	if state.ServerTime != testFixture.clock.Load() || state.LastEventID == 0 {
		t.Fatalf("state = %+v", state)
	}
}

func TestPresenceKeepsAJellyOnTheStageWithoutXP(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	for range 3 {
		testFixture.advanceClock(time.Hour)
		response := testFixture.callAPI("POST", "/v1/presence", token, "")
		if response.status != http.StatusOK {
			t.Fatalf("presence: %d %s", response.status, response.body)
		}
	}
	if state := testFixture.loadMe(token); state.XP != 0 {
		t.Fatalf("presence earned %d XP", state.XP)
	}
	if players := testFixture.loadStage().Players; len(players) != 1 {
		t.Fatalf("stage shows %d jellies", len(players))
	}
}

func TestCatalogListsColors(t *testing.T) {
	response := newFixture(t).callAPI("GET", "/v1/catalog", "", "")
	if !strings.Contains(string(response.body), `"colors":[{"key":"mint"`) {
		t.Fatalf("catalog = %s", response.body)
	}
}

func TestNamesOnlyUseTheFixedCharacters(t *testing.T) {
	testFixture := newFixture(t)
	for _, name := range []string{
		"\u200b", "\u3164", "T\u043emek", "Tomek\u200b", "\u202eTomek", "Bob \u00b7 99",
		"\U0001F600",
		"---", "Jelly-12", "jelly-x",
	} {
		body, err := json.Marshal(map[string]string{
			"code": joinCode, "name": name,
			"color": "mint",
		})
		if err != nil {
			t.Fatal(err)
		}
		requireProblem(t, testFixture.callAPI("POST", "/v1/auth/redeem", "", string(body)),
			http.StatusBadRequest, "invalid_name")
	}
	testFixture.registerPlayer("Jörg_Müller-2 O'Neil")
}

func TestEmptyProfileUpdateChangesNothing(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	before := testFixture.loadMe(token).LastEventID
	response := testFixture.callAPI("PATCH", "/v1/players/me", token, `{}`)
	state := decodeBody[store.PlayerState](t, response)
	if state.LastEventID != before {
		t.Fatal("an empty update wrote an event")
	}
	for _, earned := range state.Achievements {
		if earned.Key == "styled" {
			t.Fatal("an empty update earned an achievement")
		}
	}
}

func TestNameResetReachesTheStageAndCountsForNobody(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Ausfall")
	playerID := testFixture.loadMe(token).ID
	before := testFixture.loadMe(token).LastEventID
	path := fmt.Sprintf("/admin/api/players/%d/reset-name", playerID)
	if response := testFixture.callAdmin("POST", path, ""); response.status != http.StatusOK {
		t.Fatalf("reset: %d %s", response.status, response.body)
	}
	events, err := testFixture.database.ListEventsAfter(t.Context(), before)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0].Type != store.EventPlayerUpdated {
		t.Fatalf("events = %+v", events)
	}
	testFixture.advanceClock(time.Hour)
	testFixture.pokePlayer(token)
	for _, earned := range testFixture.loadMe(token).Achievements {
		if earned.Key == "styled" {
			t.Fatal("the reset by an admin earned an achievement")
		}
	}
}

func TestLANFullRejectsMorePlayers(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.registerPlayer("A")
	gameRules := testFixture.loadRules()
	gameRules["max_players"] = 1
	body, err := json.Marshal(gameRules)
	if err != nil {
		t.Fatal(err)
	}
	if response := testFixture.callAdmin("PUT", "/admin/api/lans/1/rules",
		string(body)); response.status != http.StatusOK {
		t.Fatalf("rules: %d %s", response.status, response.body)
	}
	requireProblem(t, testFixture.callAPI("POST", "/v1/auth/redeem", "",
		buildRegisterBody("B", "mint")),
		http.StatusConflict, "lan_full")
}

func TestJoinCodeCanBeReplaced(t *testing.T) {
	testFixture := newFixture(t)
	response := testFixture.callAdmin("PUT", "/admin/api/lans/1/join-code",
		`{"join_code":"neu-2026"}`)
	if response.status != http.StatusOK {
		t.Fatalf("join code: %d %s", response.status, response.body)
	}
	requireProblem(t, testFixture.callAPI("POST", "/v1/auth/redeem", "",
		buildRegisterBody("B", "mint")),
		http.StatusForbidden, "invalid_code")
	body := `{"code":"neu-2026","name":"B","color":"mint"}`
	if got := testFixture.callAPI("POST", "/v1/auth/redeem", "",
		body); got.status != http.StatusOK {
		t.Fatalf("register: %d %s", got.status, got.body)
	}
	requireProblem(t, testFixture.callAdmin("PUT", "/admin/api/lans/99/join-code",
		`{"join_code":"x"}`),
		http.StatusNotFound, "lan_not_found")
}

func TestStrangersCannotUseUpTheLimitsOfOthers(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	for range 300 {
		testFixture.callAPI("POST", "/v1/event-codes/redemptions", "", `{"code":"x"}`)
	}
	response := testFixture.callAPI("POST", "/v1/event-codes/redemptions", token, `{"code":"x"}`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_event_code")
	cookie := testFixture.loginAdmin()
	if cookie == "" {
		t.Fatal("login must still work")
	}
}

func TestOnePlayerCannotFloodTheServer(t *testing.T) {
	testFixture := newFixture(t)
	flooder := testFixture.registerPlayer("A")
	other := testFixture.registerPlayer("B")
	limited := false
	for range 200 {
		if testFixture.callAPI("GET", "/v1/players/me",
			flooder, "").status == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	if !limited {
		t.Fatal("no limit reached")
	}
	if response := testFixture.callAPI("GET", "/v1/players/me", other,
		""); response.status != http.StatusOK {
		t.Fatalf("other player: %d", response.status)
	}
}

func TestFollowingTheSameTargetAgainWritesNothing(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	target := testFixture.loadMe(testFixture.registerPlayer("B")).ID
	body := fmt.Sprintf(`{"player_id":%d}`, target)
	testFixture.callAPI("POST", "/v1/trips/follow", token, body)
	before := testFixture.loadMe(token).LastEventID
	testFixture.callAPI("POST", "/v1/trips/follow", token, body)
	if after := testFixture.loadMe(token).LastEventID; after != before {
		t.Fatalf("event IDs moved from %d to %d", before, after)
	}
}
