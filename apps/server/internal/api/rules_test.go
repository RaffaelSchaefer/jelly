package api_test

import (
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// loadLANStatus reads what a client knows about the LANs and their rules.
func (testFixture *fixture) loadLANStatus(token string) store.LANStatus {
	testFixture.t.Helper()
	response := testFixture.callAPI("GET", "/v1/lans/current", token, "")
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("status: %d %s", response.status, response.body)
	}
	return decodeBody[store.LANStatus](testFixture.t, response)
}

func TestClientsReadTheRulesButNotTheLimitsOfTheServer(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Liest")
	response := testFixture.callAPI("GET", "/v1/lans/current", token, "")
	if strings.Contains(string(response.body), "max_streams") {
		t.Fatalf("limits of the server are not for clients: %s", response.body)
	}
	if before := testFixture.loadLANStatus(token).Rules; before.XPPerLevel != 100 {
		t.Fatalf("rules: %+v", before)
	}
	changed := testFixture.callAdmin("PUT", "/admin/api/lans/1/rules", `{"near_distance":9}`)
	if changed.status != http.StatusOK {
		t.Fatalf("rules: %d %s", changed.status, changed.body)
	}
	if got := testFixture.loadLANStatus(token).Rules.NearDistance; got != 9 {
		t.Fatalf("near distance = %v", got)
	}
	events, err := testFixture.database.ListEventsAfter(t.Context(), 0)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(events, func(event store.Event) bool {
		return event.Type == store.EventRulesChanged
	}) {
		t.Fatal("clients have to hear about new rules")
	}
}

func TestXPPerLevelIsFixedOnceTheLANRuns(t *testing.T) {
	testFixture := newFixture(t)
	requireProblem(
		t,
		testFixture.callAdmin("PUT", "/admin/api/lans/1/rules", `{"xp_per_level":50}`),
		http.StatusBadRequest,
		"invalid_rules",
	)
	requireProblem(t, testFixture.callAdmin("PUT", "/admin/api/lans/1/rules", `{"xp_per_level":0}`),
		http.StatusBadRequest, "invalid_rules")

	testFixture.createFutureLAN()
	response := testFixture.callAdmin("PUT", "/admin/api/lans/2/rules", `{"xp_per_level":2}`)
	if response.status != http.StatusOK {
		t.Fatalf("a LAN that has not started can change: %d %s", response.status, response.body)
	}
	testFixture.advanceClock(30*24*time.Hour + time.Hour)
	joined := testFixture.callAPI("POST", "/v1/auth/redeem", "",
		`{"code":"next-code","name":"Schnell","color":"mint"}`)
	token := decodeBody[registerResponse](t, joined).Token
	if xp := testFixture.pokePlayer(token); xp != 3 {
		t.Fatalf("poke = %d XP", xp)
	}
	if level := testFixture.loadMe(token).Level; level != 2 {
		t.Fatalf("3 XP at 2 XP per level is level 2, got %d", level)
	}
	listing := decodeBody[store.PlayerList](t, testFixture.callAPI("GET", "/v1/players", token, ""))
	if len(listing.Items) != 1 || listing.Items[0].Level != 2 {
		t.Fatalf("players: %+v", listing.Items)
	}
}

func TestPatchChangesOnlyTheRulesItNames(t *testing.T) {
	testFixture := newFixture(t)
	const path = "/admin/api/lans/1/rules"
	token := testFixture.registerPlayer("Liest")
	response := testFixture.callAdmin("PATCH", path, `{"near_distance":9}`)
	if response.status != http.StatusOK {
		t.Fatalf("patch: %d %s", response.status, response.body)
	}
	response = testFixture.callAdmin("PATCH", path, `{"trip_seconds":77}`)
	if response.status != http.StatusOK {
		t.Fatalf("patch: %d %s", response.status, response.body)
	}
	got := testFixture.loadLANStatus(token).Rules
	if got.NearDistance != 9 || got.TripSeconds != 77 {
		t.Fatalf("rules: %+v", got)
	}
	response = testFixture.callAdmin("PUT", path, `{"trip_seconds":88}`)
	if response.status != http.StatusOK {
		t.Fatalf("put: %d %s", response.status, response.body)
	}
	got = testFixture.loadLANStatus(token).Rules
	if got.NearDistance != rules.DefaultRules().NearDistance || got.TripSeconds != 88 {
		t.Fatalf("put replaces everything: %+v", got)
	}
}

func TestPatchIsCheckedLikeEveryOtherChangeOfTheRules(t *testing.T) {
	testFixture := newFixture(t)
	const path = "/admin/api/lans/1/rules"
	requireProblem(t, testFixture.callAdmin("PATCH", path, `{"poke_interval":0}`),
		http.StatusBadRequest, "invalid_rules")
	requireProblem(t, testFixture.callAdmin("PATCH", path, `{"xp_per_level":50}`),
		http.StatusBadRequest, "invalid_rules")
	requireProblem(t, testFixture.callAdmin("PATCH", path, `{"walk_fast":true}`),
		http.StatusBadRequest, "invalid_request")
	requireProblem(
		t,
		testFixture.callAdmin("PATCH", "/admin/api/lans/99/rules", `{"trip_seconds":9}`),
		http.StatusNotFound,
		"lan_not_found",
	)
}

func TestRuleErrorsSayWhatToFix(t *testing.T) {
	testFixture := newFixture(t)
	const path = "/admin/api/lans/1/rules"
	cases := []struct {
		name string
		body string
		want string
	}{
		{"too low", `{"trip_seconds":0}`, "trip_seconds muss zwischen 1 und 2592000 liegen."},
		{"too high", `{"trip_seconds":9223372036854775807}`, "trip_seconds muss zwischen"},
		{"decimals", `{"walk_speed":0}`, "walk_speed muss zwischen 0,01 und 100 liegen."},
		{"after the start", `{"xp_per_level":50}`, "xp_per_level lässt sich nach dem Start"},
	}
	for _, testCase := range cases {
		response := testFixture.callAdmin("PATCH", path, testCase.body)
		if response.status != http.StatusBadRequest ||
			!strings.Contains(string(response.body), testCase.want) {
			t.Errorf("%s: %d %s", testCase.name, response.status, response.body)
		}
	}
}

func TestRoomSizeRulesStayInTheirRange(t *testing.T) {
	testFixture := newFixture(t)
	bodies := []string{`{"room_width":0}`, `{"room_depth":1001}`, `{"jelly_width":0.01}`}
	for _, body := range bodies {
		requireProblem(t, testFixture.callAdmin("PATCH", "/admin/api/lans/1/rules", body),
			http.StatusBadRequest, "invalid_rules")
	}
}
