package api_test

import (
	"encoding/json"
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
type stageResponse = store.StageState

// sendWithCookie calls the API with a session cookie and returns the cookie it sets.
func (testFixture *fixture) sendWithCookie(
	method, path, session, body string,
) (apiResponse, string) {
	testFixture.t.Helper()
	request := httptest.NewRequestWithContext(
		testFixture.t.Context(), method, path, strings.NewReader(body),
	)
	if session != "" {
		request.AddCookie(&http.Cookie{Name: "jelly_admin", Value: session})
	}
	recorder := httptest.NewRecorder()
	testFixture.handler.ServeHTTP(recorder, request)
	response := apiResponse{status: recorder.Code, body: recorder.Body.Bytes()}
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == "jelly_admin" {
			return response, cookie.Value
		}
	}
	return response, ""
}

// loginAdmin returns a new admin session.
func (testFixture *fixture) loginAdmin() string {
	testFixture.t.Helper()
	response, session := testFixture.sendWithCookie(
		"POST", "/admin/api/login", "", `{"secret":"`+adminSecret+`"}`,
	)
	if response.status != http.StatusOK || session == "" {
		testFixture.t.Fatalf("login: %d %s", response.status, response.body)
	}
	return session
}

func (testFixture *fixture) callAdmin(method, path, body string) apiResponse {
	testFixture.t.Helper()
	response, _ := testFixture.sendWithCookie(method, path, testFixture.loginAdmin(), body)
	return response
}

// loadRules returns the rules of the first LAN as fields, to change one of them.
func (testFixture *fixture) loadRules() map[string]any {
	testFixture.t.Helper()
	response := testFixture.callAdmin("GET", "/admin/api/lans", "")
	var lans []struct {
		Rules map[string]any `json:"rules"`
	}
	err := json.Unmarshal(response.body, &lans)
	if err != nil || len(lans) == 0 {
		testFixture.t.Fatalf("list LANs: %v %s", err, response.body)
	}
	return lans[0].Rules
}

func (testFixture *fixture) loadStage() stageResponse {
	testFixture.t.Helper()
	response := testFixture.callAPI("GET", "/v1/stage?key="+stageKey, "", "")
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

func findAchievementKeys(state store.PlayerState) []string {
	keys := []string{}
	for _, earned := range state.Achievements {
		keys = append(keys, earned.Key)
	}
	return keys
}

func TestReports(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")

	response := testFixture.callAPI("POST", "/v1/reports", token, `{"kind":"food"}`)
	if got := decodeBody[pokeResponse](t, response).XPGained; got != 15 {
		t.Fatalf("food = %d XP, want 15", got)
	}
	response = testFixture.callAPI("POST", "/v1/reports", token, `{"kind":"food"}`)
	requireProblem(t, response, http.StatusConflict, "report_cooldown")
	response = testFixture.callAPI("POST", "/v1/reports", token, `{"kind":"drink"}`)
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

	response := testFixture.callAPI("POST", "/v1/event-codes/redemptions",
		token, `{"code":"falsch"}`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_event_code")
	response = testFixture.callAPI("POST", "/v1/event-codes/redemptions",
		token, `{"code":" TURNIER "}`)
	redeemed := decodeBody[store.RedeemedCode](t, response)
	if redeemed.XPGained != 30 || redeemed.Title != "Turnier" {
		t.Fatalf("redeem: %s", response.body)
	}
	if !slices.Contains(redeemed.Me.Cosmetics, "party-hat") {
		t.Fatalf("party hat is missing: %v", redeemed.Me.Cosmetics)
	}
	if !slices.Contains(findAchievementKeys(redeemed.Me), "first-event") {
		t.Fatalf("achievement is missing: %+v", redeemed.Me.Achievements)
	}
	response = testFixture.callAPI("POST", "/v1/event-codes/redemptions",
		token, `{"code":"TURNIER"}`)
	requireProblem(t, response, http.StatusConflict, "event_code_redeemed")

	testFixture.advanceClock(time.Hour)
	other := testFixture.registerPlayer("B")
	response = testFixture.callAPI("POST", "/v1/event-codes/redemptions",
		other, `{"code":"TURNIER"}`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_event_code")
}

func TestCosmeticsRequireUnlock(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	response := testFixture.callAPI("PUT", "/v1/cosmetics/equipped", token,
		`{"slot":"head","key":"crown"}`)
	requireProblem(t, response, http.StatusConflict, "cosmetic_locked")

	testFixture.createEventCode("HUT")
	testFixture.callAPI("POST", "/v1/event-codes/redemptions", token, `{"code":"HUT"}`)
	response = testFixture.callAPI("PUT", "/v1/cosmetics/equipped", token,
		`{"slot":"head","key":"party-hat"}`)
	state := decodeBody[store.PlayerState](t, response)
	if state.Equipped["head"].Key != "party-hat" {
		t.Fatalf("equipped: %s", response.body)
	}
	if !slices.Contains(findAchievementKeys(state), "styled") {
		t.Fatalf("achievement is missing: %+v", state.Achievements)
	}
	response = testFixture.callAPI("PUT", "/v1/cosmetics/equipped", token, `{"slot":"head"}`)
	if len(decodeBody[store.PlayerState](t, response).Equipped) != 0 {
		t.Fatalf("cosmetic stays on: %s", response.body)
	}
	requireProblem(t, testFixture.callAPI("PUT", "/v1/cosmetics/equipped", token,
		`{"slot":"tail"}`), http.StatusBadRequest, "unknown_slot")
	requireProblem(t, testFixture.callAPI("PUT", "/v1/cosmetics/equipped", token,
		`{"slot":"face","key":"party-hat"}`), http.StatusBadRequest, "unknown_cosmetic")
	requireProblem(t, testFixture.callAPI("PUT", "/v1/cosmetics/equipped", token,
		`{"slot":"head","key":"party-hat","color":"#ffffff"}`),
		http.StatusBadRequest, "invalid_cosmetic_color")
}

func TestNewLANRestartsXPAndKeepsHistory(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.pokePlayer(token)

	nextLANStart := readLANStart().AddDate(1, 0, 0)
	testFixture.createLAN("ucb-2027", nextLANStart)
	testFixture.clock.Store(nextLANStart.Add(time.Hour).UnixMilli())

	secret := testFixture.seatPlayerInSecondLAN(testFixture.loadMe(token).ID)
	state := testFixture.loadMe(secret)
	if state.XP != 0 || state.Level != 1 || state.TotalXP != 3 || len(state.Badges) != 2 {
		t.Fatalf("state in the new LAN: %+v", state)
	}
	if got := testFixture.callAPI("GET", "/v1/players/me", token, "").status; got != 401 {
		t.Fatalf("the old secret still works: %d", got)
	}
}

func TestStageShowsSignsFollowsAndPresence(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	secondID := testFixture.loadMe(second).ID

	response := testFixture.callAPI("PUT", "/v1/signs/current", first, `{"key":"free text"}`)
	requireProblem(t, response, http.StatusBadRequest, "unknown_sign")
	testFixture.callAPI("PUT", "/v1/signs/current", first, `{"key":"cs2"}`)
	body := `{"player_id":` + strconv.FormatInt(secondID, 10) + `}`
	response = testFixture.callAPI("POST", "/v1/trips/follow", first, body)
	keys := findAchievementKeys(decodeBody[store.PlayerState](t, response))
	if !slices.Contains(keys, "neighbor") {
		t.Fatalf("achievement is missing: %s", response.body)
	}
	selfBody := `{"player_id":` + strconv.FormatInt(testFixture.loadMe(first).ID, 10) + `}`
	response = testFixture.callAPI("POST", "/v1/trips/follow", first, selfBody)
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
	response := testFixture.callAPI("POST", "/v1/emotes", token, `{"key":"free text"}`)
	requireProblem(t, response, http.StatusBadRequest, "unknown_emote")
	response = testFixture.callAPI("POST", "/v1/emotes", token, `{"key":"wave"}`)
	if response.status != http.StatusOK {
		t.Fatalf("emote: %d %s", response.status, response.body)
	}
	response = testFixture.callAPI("POST", "/v1/emotes", token, `{"key":"wave"}`)
	requireProblem(t, response, http.StatusConflict, "emote_cooldown")
}

func TestMarathonIsPublicAndTracksARecord(t *testing.T) {
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
	events, err := testFixture.database.ListEventsAfter(t.Context(), 0)
	if err != nil {
		t.Fatal(err)
	}
	announced := slices.ContainsFunc(events, func(event store.Event) bool {
		return event.Type == store.EventAchievement &&
			strings.Contains(string(event.Payload), "marathon")
	})
	if !announced {
		t.Fatal("marathon must reach the public stream")
	}
}

func TestStateRequiresAccess(t *testing.T) {
	testFixture := newFixture(t)
	requireProblem(t, testFixture.callAPI("GET", "/v1/stage", "", ""),
		http.StatusUnauthorized, "unauthorized")
	requireProblem(t, testFixture.callAPI("GET", "/v1/stage?key=wrong", "", ""),
		http.StatusUnauthorized, "unauthorized")
	token := testFixture.registerPlayer("A")
	if got := testFixture.callAPI("GET", "/v1/stage", token, "").status; got != http.StatusOK {
		t.Fatalf("player token: %d", got)
	}
}

func TestAdminRequiresSession(t *testing.T) {
	testFixture := newFixture(t)
	requireProblem(t, testFixture.callAPI("GET", "/admin/api/players", "", ""),
		http.StatusForbidden, "forbidden")
	requireProblem(t, testFixture.callAPI("GET", "/admin/api/players", adminSecret, ""),
		http.StatusForbidden, "forbidden")
	response, _ := testFixture.sendWithCookie("POST", "/admin/api/login", "", `{"secret":"wrong"}`)
	requireProblem(t, response, http.StatusForbidden, "forbidden")
	forged := "9999999999999.forged"
	response, _ = testFixture.sendWithCookie("GET", "/admin/api/players", forged, "")
	requireProblem(t, response, http.StatusForbidden, "forbidden")
	if got := testFixture.callAdmin("GET", "/admin/api/players", "").status; got != http.StatusOK {
		t.Fatalf("session: %d", got)
	}
}

func TestAdminSessionExpiresWhenIdle(t *testing.T) {
	testFixture := newFixture(t)
	session := testFixture.loginAdmin()

	testFixture.advanceClock(20 * time.Minute)
	response, renewed := testFixture.sendWithCookie("GET", "/admin/api/players", session, "")
	if response.status != http.StatusOK || renewed == "" {
		t.Fatalf("active session: %d, cookie %q", response.status, renewed)
	}
	testFixture.advanceClock(20 * time.Minute)
	response, _ = testFixture.sendWithCookie("GET", "/admin/api/players", session, "")
	requireProblem(t, response, http.StatusForbidden, "forbidden")
	response, _ = testFixture.sendWithCookie("GET", "/admin/api/players", renewed, "")
	if response.status != http.StatusOK {
		t.Fatalf("renewed session: %d", response.status)
	}
	testFixture.advanceClock(31 * time.Minute)
	response, _ = testFixture.sendWithCookie("GET", "/admin/api/players", renewed, "")
	requireProblem(t, response, http.StatusForbidden, "forbidden")
}

func TestAdminCookieIsProtected(t *testing.T) {
	testFixture := newFixture(t)
	request := httptest.NewRequestWithContext(t.Context(), "POST", "/admin/api/login",
		strings.NewReader(`{"secret":"`+adminSecret+`"}`))
	recorder := httptest.NewRecorder()
	testFixture.handler.ServeHTTP(recorder, request)
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies: %+v", cookies)
	}
	cookie := cookies[0]
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatalf("cookie is not protected: %+v", cookie)
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
	requireProblem(t, testFixture.callAPI("GET", "/v1/players/me", token, ""),
		http.StatusUnauthorized, "unauthorized")
	testFixture.loadMe(rotated.Token)

	testFixture.callAdmin("DELETE", base, "")
	requireProblem(t, testFixture.callAPI("GET", "/v1/players/me", rotated.Token, ""),
		http.StatusUnauthorized, "unauthorized")
	requireProblem(t, testFixture.callAdmin("DELETE", base, ""),
		http.StatusNotFound, "player_not_found")
}

func TestAdminActionsAreLoggedWithoutNames(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Beleidigung")
	playerID := testFixture.loadMe(token).ID
	base := "/admin/api/players/" + strconv.FormatInt(playerID, 10)
	testFixture.callAdmin("POST", base+"/hide", "")
	testFixture.callAdmin("DELETE", base, "")

	response := testFixture.callAdmin("GET", "/admin/api/actions", "")
	if strings.Contains(string(response.body), "Beleidigung") {
		t.Fatalf("the log must not hold names: %s", response.body)
	}
	actions := decodeBody[[]store.AdminAction](t, response)
	if len(actions) != 2 || actions[0].Action != store.AdminActionDelete {
		t.Fatalf("actions: %s", response.body)
	}
	if actions[1].TargetID == nil || *actions[1].TargetID != playerID {
		t.Fatalf("the log needs the target: %s", response.body)
	}
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
		`"presence_window":5400,"emote_cooldown":3,"partner_invite_seconds":120,"partner_xp":5,` +
		`"full_house_percent":33,"max_players":120,"max_streams":200,"max_player_streams":3,` +
		`"snack_run_seconds":14,"trip_seconds":300,"follow_cooldown":1800,"near_distance":6}`
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
