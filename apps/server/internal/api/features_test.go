package api_test

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// stageResponse is the response of `GET /state`.
type stageResponse struct {
	LastEventID int64               `json:"last_event_id"`
	Players     []store.StagePlayer `json:"players"`
}

func (testFixture *fixture) callAdmin(method, path, body string) apiResponse {
	testFixture.t.Helper()
	return testFixture.callAPI(method, path, adminSecret, body)
}

func (testFixture *fixture) loadStage() stageResponse {
	testFixture.t.Helper()
	response := testFixture.callAPI("GET", "/state?key="+stageKey, "", "")
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("state: %d %s", response.status, response.body)
	}
	return decodeBody[stageResponse](testFixture.t, response)
}

func (testFixture *fixture) createEventCode(code string) {
	testFixture.t.Helper()
	now := testFixture.clock.Load()
	body := `{"lan_id":1,"title":"Turnier","code":"` + code + `","xp":30,"valid_from":` +
		strconv.FormatInt(now-1000, 10) + `,"valid_until":` +
		strconv.FormatInt(now+60_000, 10) + `}`
	response := testFixture.callAdmin("POST", "/admin/api/event-codes", body)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("create code: %d %s", response.status, response.body)
	}
}

func findAchievementKeys(state store.State) []string {
	keys := []string{}
	for _, earned := range state.Achievements {
		keys = append(keys, earned.Key)
	}
	return keys
}

func TestReports(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")

	response := testFixture.callAPI("POST", "/actions", token, `{"action":"food"}`)
	if got := decodeBody[pokeResponse](t, response).XPGained; got != 15 {
		t.Fatalf("food = %d XP, want 15", got)
	}
	response = testFixture.callAPI("POST", "/actions", token, `{"action":"food"}`)
	requireProblem(t, response, http.StatusConflict, "report_cooldown")
	response = testFixture.callAPI("POST", "/actions", token, `{"action":"drink"}`)
	if got := decodeBody[pokeResponse](t, response).XPGained; got != 10 {
		t.Fatalf("drink = %d XP, want 10", got)
	}
	state := testFixture.loadMe(token)
	if state.Reports == nil || state.Reports.ReportsLeft != 6 {
		t.Fatalf("reports: %+v", state.Reports)
	}
}

func TestPokeCatchUpReachesOneHour(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.pokePlayer(token)
	testFixture.advanceClock(5 * time.Hour)
	if got := testFixture.pokePlayer(token); got != 12 {
		t.Fatalf("poke after 5 hours = %d XP, want 12", got)
	}
}

func TestEventCodes(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.createEventCode("TURNIER")

	response := testFixture.callAPI("POST", "/redeem", token, `{"code":"falsch"}`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_event_code")
	response = testFixture.callAPI("POST", "/redeem", token, `{"code":" TURNIER "}`)
	redeemed := decodeBody[store.RedeemedCode](t, response)
	if redeemed.XPGained != 30 || redeemed.Title != "Turnier" {
		t.Fatalf("redeem: %s", response.body)
	}
	if !slices.Contains(redeemed.State.Cosmetics, "party-hat") {
		t.Fatalf("party hat is missing: %v", redeemed.State.Cosmetics)
	}
	if !slices.Contains(findAchievementKeys(redeemed.State), "first-event") {
		t.Fatalf("achievement is missing: %+v", redeemed.State.Achievements)
	}
	response = testFixture.callAPI("POST", "/redeem", token, `{"code":"TURNIER"}`)
	requireProblem(t, response, http.StatusConflict, "event_code_redeemed")

	testFixture.advanceClock(time.Hour)
	other := testFixture.registerPlayer("B")
	response = testFixture.callAPI("POST", "/redeem", other, `{"code":"TURNIER"}`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_event_code")
}

func TestCosmeticsRequireUnlock(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	response := testFixture.callAPI("PATCH", "/me", token, `{"cosmetic":"crown"}`)
	requireProblem(t, response, http.StatusConflict, "cosmetic_locked")

	testFixture.createEventCode("HUT")
	testFixture.callAPI("POST", "/redeem", token, `{"code":"HUT"}`)
	response = testFixture.callAPI("PATCH", "/me", token,
		`{"cosmetic":"party-hat","color":"peach"}`)
	state := decodeBody[store.State](t, response)
	if state.Cosmetic == nil || *state.Cosmetic != "party-hat" || state.Color != "peach" {
		t.Fatalf("profile: %s", response.body)
	}
	if !slices.Contains(findAchievementKeys(state), "styled") {
		t.Fatalf("achievement is missing: %+v", state.Achievements)
	}
	response = testFixture.callAPI("PATCH", "/me", token, `{"cosmetic":""}`)
	if decodeBody[store.State](t, response).Cosmetic != nil {
		t.Fatalf("cosmetic stays on: %s", response.body)
	}
}

func TestNewLANRestartsXPAndKeepsHistory(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.pokePlayer(token)

	nextLANStart := readLANStart().AddDate(1, 0, 0)
	testFixture.createLAN("ucb-2027", nextLANStart)
	testFixture.clock.Store(nextLANStart.Add(time.Hour).UnixMilli())

	response := testFixture.callAPI("POST", "/lans/current/join", token, `{"code":"falsch"}`)
	requireProblem(t, response, http.StatusForbidden, "invalid_code")
	response = testFixture.callAPI("POST", "/lans/current/join", token,
		`{"code":"`+joinCode+`"}`)
	state := decodeBody[store.State](t, response)
	if state.XP != 0 || state.Level != 1 || state.TotalXP != 3 || len(state.Badges) != 2 {
		t.Fatalf("state in the new LAN: %s", response.body)
	}
	response = testFixture.callAPI("POST", "/lans/current/join", token,
		`{"code":"`+joinCode+`"}`)
	requireProblem(t, response, http.StatusConflict, "already_joined")
}

func TestStageShowsSignsFollowsAndPresence(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	secondID := testFixture.loadMe(second).ID

	response := testFixture.callAPI("PUT", "/sign", first, `{"key":"free text"}`)
	requireProblem(t, response, http.StatusBadRequest, "unknown_sign")
	testFixture.callAPI("PUT", "/sign", first, `{"key":"cs2"}`)
	body := `{"player_id":` + strconv.FormatInt(secondID, 10) + `}`
	response = testFixture.callAPI("PUT", "/follow", first, body)
	if !slices.Contains(findAchievementKeys(decodeBody[store.State](t, response)), "neighbor") {
		t.Fatalf("achievement is missing: %s", response.body)
	}
	selfBody := `{"player_id":` + strconv.FormatInt(testFixture.loadMe(first).ID, 10) + `}`
	response = testFixture.callAPI("PUT", "/follow", first, selfBody)
	requireProblem(t, response, http.StatusBadRequest, "invalid_follow")

	stage := testFixture.loadStage()
	if len(stage.Players) != 2 || stage.Players[0].Sign == nil || *stage.Players[0].Sign != "cs2" {
		t.Fatalf("stage: %+v", stage)
	}
	if stage.Players[0].FollowPlayerID == nil || *stage.Players[0].FollowPlayerID != secondID {
		t.Fatalf("follow: %+v", stage.Players[0])
	}

	testFixture.advanceClock(2 * time.Hour)
	if got := len(testFixture.loadStage().Players); got != 0 {
		t.Fatalf("inactive jellies stay on the stage: %d", got)
	}
	testFixture.pokePlayer(first)
	if got := len(testFixture.loadStage().Players); got != 1 {
		t.Fatalf("active jelly is missing: %d", got)
	}
}

func TestEmotes(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	response := testFixture.callAPI("POST", "/emote", token, `{"key":"free text"}`)
	requireProblem(t, response, http.StatusBadRequest, "unknown_emote")
	response = testFixture.callAPI("POST", "/emote", token, `{"key":"wave"}`)
	if response.status != http.StatusOK {
		t.Fatalf("emote: %d %s", response.status, response.body)
	}
	response = testFixture.callAPI("POST", "/emote", token, `{"key":"wave"}`)
	requireProblem(t, response, http.StatusConflict, "emote_cooldown")
}

func TestMarathonIsQuietAndTracksARecord(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	for range 11 {
		testFixture.advanceClock(time.Hour)
		testFixture.pokePlayer(token)
	}
	state := testFixture.loadMe(token)
	var best int
	for _, earned := range state.Achievements {
		if earned.Key == "marathon" {
			best = earned.Best
		}
	}
	if best != 11 {
		t.Fatalf("marathon record = %d, want 11: %+v", best, state.Achievements)
	}
	events, err := testFixture.database.ListEventsAfter(t.Context(), 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range events {
		isMarathon := strings.Contains(string(event.Payload), "marathon")
		if event.Type == store.EventAchievement && isMarathon {
			t.Fatalf("marathon reached the public stream: %s", event.Payload)
		}
	}
}

func TestStateRequiresAccess(t *testing.T) {
	testFixture := newFixture(t)
	requireProblem(t, testFixture.callAPI("GET", "/state", "", ""),
		http.StatusUnauthorized, "unauthorized")
	requireProblem(t, testFixture.callAPI("GET", "/state?key=wrong", "", ""),
		http.StatusUnauthorized, "unauthorized")
	token := testFixture.registerPlayer("A")
	if got := testFixture.callAPI("GET", "/state", token, "").status; got != http.StatusOK {
		t.Fatalf("player token: %d", got)
	}
}

func TestAdminRequiresSecret(t *testing.T) {
	testFixture := newFixture(t)
	requireProblem(t, testFixture.callAPI("GET", "/admin/api/players", "", ""),
		http.StatusForbidden, "forbidden")
	requireProblem(t, testFixture.callAPI("GET", "/admin/api/players", "wrong", ""),
		http.StatusForbidden, "forbidden")
	if got := testFixture.callAdmin("GET", "/admin/api/players", "").status; got != http.StatusOK {
		t.Fatalf("admin secret: %d", got)
	}
}

func TestModeration(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Beleidigung")
	playerID := strconv.FormatInt(testFixture.loadMe(token).ID, 10)
	base := "/admin/api/players/" + playerID

	testFixture.callAdmin("POST", base+"/hide", "")
	if got := len(testFixture.loadStage().Players); got != 0 {
		t.Fatalf("hidden jelly stays on the stage: %d", got)
	}
	if got := testFixture.pokePlayer(token); got != 3 {
		t.Fatalf("a hidden player keeps playing, got %d XP", got)
	}
	testFixture.callAdmin("POST", base+"/show", "")
	if got := len(testFixture.loadStage().Players); got != 1 {
		t.Fatalf("shown jelly is missing: %d", got)
	}

	testFixture.callAdmin("POST", base+"/reset-name", "")
	if got := testFixture.loadMe(token).Name; got != "Jelly-"+playerID {
		t.Fatalf("name = %q", got)
	}

	response := testFixture.callAdmin("POST", base+"/rotate-token", "")
	rotated := decodeBody[registerResponse](t, response)
	requireProblem(t, testFixture.callAPI("GET", "/me", token, ""),
		http.StatusUnauthorized, "unauthorized")
	testFixture.loadMe(rotated.Token)

	testFixture.callAdmin("DELETE", base, "")
	requireProblem(t, testFixture.callAPI("GET", "/me", rotated.Token, ""),
		http.StatusUnauthorized, "unauthorized")
	requireProblem(t, testFixture.callAdmin("DELETE", base, ""),
		http.StatusNotFound, "player_not_found")
}

func TestAwardGivesPermanentCosmetic(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	playerID := strconv.FormatInt(testFixture.loadMe(token).ID, 10)
	response := testFixture.callAdmin("POST", "/admin/api/awards",
		`{"player_id":`+playerID+`,"title":"Turniersieg","cosmetic_key":"golden-cup"}`)
	if response.status != http.StatusOK {
		t.Fatalf("award: %d %s", response.status, response.body)
	}
	state := testFixture.loadMe(token)
	if !slices.Contains(state.Cosmetics, "golden-cup") || len(state.Awards) != 1 {
		t.Fatalf("award is missing: %+v", state)
	}
	if !slices.Contains(findAchievementKeys(state), "honored") {
		t.Fatalf("achievement is missing: %+v", state.Achievements)
	}
}

func TestRulesCanChangeDuringALAN(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	body := `{"poke_interval":60,"poke_xp":5,"poke_max_ticks":1,"food_xp":15,"drink_xp":10,` +
		`"report_cooldown":1800,"report_window":86400,"reports_per_window":8,` +
		`"presence_window":5400,"emote_cooldown":3}`
	response := testFixture.callAdmin("PUT", "/admin/api/lans/1/rules", body)
	if response.status != http.StatusOK {
		t.Fatalf("rules: %d %s", response.status, response.body)
	}
	if got := testFixture.pokePlayer(token); got != 5 {
		t.Fatalf("poke = %d XP, want 5", got)
	}
	response = testFixture.callAdmin("PUT", "/admin/api/lans/1/rules",
		strings.ReplaceAll(body, `"poke_interval":60`, `"poke_interval":0`))
	requireProblem(t, response, http.StatusBadRequest, "invalid_rules")
}

// readStreamEvents reads SSE lines until `count` events arrived.
func readStreamEvents(t *testing.T, scanner *bufio.Scanner, count int) []string {
	t.Helper()
	types := []string{}
	for len(types) < count && scanner.Scan() {
		if eventType, found := strings.CutPrefix(scanner.Text(), "event: "); found {
			types = append(types, eventType)
		}
	}
	if len(types) < count {
		t.Fatalf("stream ended after %v: %v", types, scanner.Err())
	}
	return types
}

func TestStreamDeliversReplaysAndStops(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	server := httptest.NewServer(testFixture.handler)
	defer server.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet,
		server.URL+"/events/stream?since=0&key="+stageKey, http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	if got := response.Header.Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("content type = %q", got)
	}
	scanner := bufio.NewScanner(response.Body)
	replayed := readStreamEvents(t, scanner, 1)
	if replayed[0] != store.EventPlayerActive {
		t.Fatalf("replay = %v", replayed)
	}

	testFixture.callAPI("POST", "/emote", token, `{"key":"wave"}`)
	live := readStreamEvents(t, scanner, 1)
	if live[0] != store.EventEmote {
		t.Fatalf("live = %v", live)
	}

	testFixture.stopping.Store(true)
	for scanner.Scan() {
		continue
	}
	if err := ctx.Err(); err != nil {
		t.Fatalf("stream did not end when the server stopped: %v", err)
	}
}
