package api_test

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// createSeat adds a seat to a LAN and returns its area ID.
func (testFixture *fixture) createSeat(lanID int) string {
	testFixture.t.Helper()
	response := testFixture.callAdmin("POST", "/admin/api/lans/"+strconv.Itoa(lanID)+"/areas",
		`{"x":10,"y":10,"width":5,"height":5,"kind":"seats"}`)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("create seat: %d %s", response.status, response.body)
	}
	return strconv.FormatInt(decodeBody[store.StageArea](testFixture.t, response).ID, 10)
}

// issueCode gives a seat a new code, optionally for an existing account.
func (testFixture *fixture) issueCode(lanID int, areaID, body string) string {
	testFixture.t.Helper()
	response := testFixture.callAdmin("POST",
		"/admin/api/lans/"+strconv.Itoa(lanID)+"/areas/"+areaID+"/code", body)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("issue code: %d %s", response.status, response.body)
	}
	return decodeBody[store.SeatCode](testFixture.t, response).Code
}

// redeemAnswer is the part of the answer of `POST /auth/redeem` about the seat.
type redeemAnswer struct {
	SeatAssigned bool `json:"seat_assigned"`
}

// redeem exchanges a code for a secret.
func (testFixture *fixture) redeem(body map[string]string) apiResponse {
	testFixture.t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		testFixture.t.Fatal(err)
	}
	return testFixture.callAPI("POST", "/v1/auth/redeem", "", string(encoded))
}

// redeemWith sends a code with the secret of an account.
func (testFixture *fixture) redeemWith(token, code string) apiResponse {
	testFixture.t.Helper()
	return testFixture.callAPI("POST", "/v1/auth/redeem", token, `{"code":"`+code+`"}`)
}

// seatPlayerInSecondLAN assigns an account to a seat of the second LAN and returns its secret.
func (testFixture *fixture) seatPlayerInSecondLAN(token string) string {
	testFixture.t.Helper()
	code := testFixture.issueCode(2, testFixture.createSeat(2),
		`{"player_id":`+strconv.FormatInt(testFixture.loadMe(token).ID, 10)+`}`)
	response := testFixture.redeemWith(token, code)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("redeem: %d %s", response.status, response.body)
	}
	return decodeBody[registerResponse](testFixture.t, response).Token
}

// findStageArea returns the area of a jelly on the stage, or nil.
func (testFixture *fixture) findStageArea(playerID int64) *int64 {
	testFixture.t.Helper()
	for _, player := range testFixture.loadStage().Players {
		if player.ID == playerID {
			return player.AreaID
		}
	}
	testFixture.t.Fatalf("jelly %d is not on the stage", playerID)
	return nil
}

// requireSeat checks which seat a jelly has.
func (testFixture *fixture) requireSeat(playerID int64, seatID string) {
	testFixture.t.Helper()
	area := testFixture.findStageArea(playerID)
	if area == nil || strconv.FormatInt(*area, 10) != seatID {
		testFixture.t.Fatalf("jelly %d has area %v, want %s", playerID, area, seatID)
	}
}

func TestSeatCodeCreatesAnAccountOnItsSeatOnce(t *testing.T) {
	testFixture := newFixture(t)
	seatID := testFixture.createSeat(1)
	code := testFixture.issueCode(1, seatID, `{}`)

	requireProblem(t, testFixture.redeem(map[string]string{"code": code}),
		http.StatusBadRequest, "invalid_name")
	response := testFixture.redeem(map[string]string{
		"code": " " + code + " ", "name": "Sitzer", "color": "mint",
	})
	if response.status != http.StatusOK {
		t.Fatalf("redeem: %d %s", response.status, response.body)
	}
	if !decodeBody[redeemAnswer](t, response).SeatAssigned {
		t.Fatalf("the code should give the seat: %s", response.body)
	}
	secret := decodeBody[registerResponse](t, response).Token
	state := testFixture.loadMe(secret)
	if state.Name != "Sitzer" {
		t.Fatalf("state: %+v", state)
	}
	testFixture.requireSeat(state.ID, seatID)
	requireProblem(t, testFixture.redeem(map[string]string{
		"code": code, "name": "Dieb", "color": "mint",
	}), http.StatusConflict, "code_redeemed")
}

func TestSeatCodeWithASecretSeatsThatAccountAndKeepsItsSecret(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Vorhanden")
	testFixture.pokePlayer(token)
	seatID := testFixture.createSeat(1)

	response := testFixture.redeemWith(token, testFixture.issueCode(1, seatID, `{}`))
	if response.status != http.StatusOK {
		t.Fatalf("redeem: %d %s", response.status, response.body)
	}
	if secret := decodeBody[registerResponse](t, response).Token; secret != token {
		t.Fatalf("secret changed to %q", secret)
	}
	state := testFixture.loadMe(token)
	if state.Name != "Vorhanden" || state.XP == 0 {
		t.Fatalf("state: %+v", state)
	}
	testFixture.requireSeat(state.ID, seatID)
	codes := decodeBody[[]store.SeatCode](t,
		testFixture.callAdmin("GET", "/admin/api/lans/1/seat-codes", ""))
	if len(codes) != 1 || codes[0].UsedAt == nil || !codes[0].IsSeated ||
		codes[0].Name == nil || *codes[0].Name != "Vorhanden" {
		t.Fatalf("codes: %+v", codes)
	}
}

func TestBoundSeatCodeOnlyWorksForItsAccountAndSurvivesOtherTries(t *testing.T) {
	testFixture := newFixture(t)
	owner := testFixture.registerPlayer("Besitzer")
	stranger := testFixture.registerPlayer("Fremder")
	seatID := testFixture.createSeat(1)
	code := testFixture.issueCode(1, seatID,
		`{"player_id":`+strconv.FormatInt(testFixture.loadMe(owner).ID, 10)+`}`)

	requireProblem(t, testFixture.redeem(map[string]string{
		"code": code, "name": "Neu", "color": "mint",
	}), http.StatusForbidden, "seat_code_other_account")
	requireProblem(t, testFixture.redeemWith(stranger, code),
		http.StatusForbidden, "seat_code_other_account")

	if got := testFixture.redeemWith(owner, code).status; got != http.StatusOK {
		t.Fatalf("the owner redeems: %d", got)
	}
	testFixture.requireSeat(testFixture.loadMe(owner).ID, seatID)
}

func TestTakenSeatUsesUpTheCodeButStillJoinsTheLAN(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("Erster")
	firstID := testFixture.loadMe(first).ID
	seatID := testFixture.createSeat(1)
	if got := testFixture.redeemWith(
		first,
		testFixture.issueCode(1, seatID, `{}`),
	).status; got != 200 {
		t.Fatalf("first seat: %d", got)
	}

	code := testFixture.issueCode(1, seatID, `{}`)
	response := testFixture.redeem(map[string]string{
		"code": code, "name": "Zweiter", "color": "mint",
	})
	if response.status != http.StatusOK || decodeBody[redeemAnswer](t, response).SeatAssigned {
		t.Fatalf("the seat is taken: %d %s", response.status, response.body)
	}
	secondID := testFixture.loadMe(decodeBody[registerResponse](t, response).Token).ID
	if area := testFixture.findStageArea(secondID); area != nil {
		t.Fatalf("the second jelly must not get a seat: %v", *area)
	}
	testFixture.requireSeat(firstID, seatID)
	requireProblem(t, testFixture.redeem(map[string]string{
		"code": code, "name": "Dritter", "color": "mint",
	}), http.StatusConflict, "code_redeemed")
}

func TestSeatCodeKeepsAnOtherSeatOfTheAccount(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Sitzer")
	seatID := testFixture.createSeat(1)
	testFixture.redeemWith(token, testFixture.issueCode(1, seatID, `{}`))

	response := testFixture.redeemWith(
		token,
		testFixture.issueCode(1, testFixture.createSeat(1), `{}`),
	)
	if response.status != http.StatusOK || decodeBody[redeemAnswer](t, response).SeatAssigned {
		t.Fatalf("a second seat is only for the orga: %d %s", response.status, response.body)
	}
	testFixture.requireSeat(testFixture.loadMe(token).ID, seatID)
}

func TestSeatCodeWorksBeforeTheLANButNotAfterIt(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.createFutureLAN()
	token := testFixture.registerPlayer("Früh")
	code := testFixture.issueCode(2, testFixture.createSeat(2), `{}`)

	response := testFixture.redeemWith(token, code)
	if response.status != http.StatusOK || !decodeBody[redeemAnswer](t, response).SeatAssigned {
		t.Fatalf("redeem before the LAN: %d %s", response.status, response.body)
	}
	if state := testFixture.loadMe(token); state.LAN == nil || state.LAN.Slug == "next" {
		t.Fatalf("the running LAN stays the current one: %+v", state.LAN)
	}
	if xp := testFixture.pokePlayer(token); xp == 0 {
		t.Fatal("registering for the next LAN must not stop the running one")
	}

	late := testFixture.issueCode(1, testFixture.createSeat(1), `{}`)
	testFixture.advanceClock(200 * time.Hour)
	requireProblem(t, testFixture.redeemWith(token, late), http.StatusForbidden, "invalid_code")
}

func TestLANCodeWithASecretJoinsWithoutANewAccount(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.createFutureLAN()
	token := testFixture.registerPlayer("Bleibt")
	playerID := testFixture.loadMe(token).ID

	response := testFixture.redeemWith(token, "next-code")
	if response.status != http.StatusOK {
		t.Fatalf("redeem: %d %s", response.status, response.body)
	}
	if secret := decodeBody[registerResponse](t, response).Token; secret != token {
		t.Fatalf("secret changed to %q", secret)
	}
	testFixture.advanceClock(30*24*time.Hour + time.Hour)
	if xp := testFixture.pokePlayer(token); xp == 0 {
		t.Fatal("the account takes part in the next LAN")
	}
	if state := testFixture.loadMe(token); state.ID != playerID || state.LAN.Slug != "next" {
		t.Fatalf("state: %+v", state)
	}
}

func TestRedeemRefusesASecretThatIsWrong(t *testing.T) {
	testFixture := newFixture(t)
	requireProblem(t, testFixture.redeemWith("wrong", joinCode),
		http.StatusUnauthorized, "unauthorized")
}

func TestIssueSeatCodeRefusesAnUnknownAccount(t *testing.T) {
	testFixture := newFixture(t)
	response := testFixture.callAdmin("POST",
		"/admin/api/lans/1/areas/"+testFixture.createSeat(1)+"/code", `{"player_id":999}`)
	requireProblem(t, response, http.StatusNotFound, "player_not_found")
}

// createRecoveryCode lets the admin create a recovery code for an account.
func (testFixture *fixture) createRecoveryCode(playerID int64, body string) apiResponse {
	testFixture.t.Helper()
	return testFixture.callAdmin("POST",
		"/admin/api/players/"+strconv.FormatInt(playerID, 10)+"/recovery-code", body)
}

// recoverWith sends a recovery code.
func (testFixture *fixture) recoverWith(code string) apiResponse {
	testFixture.t.Helper()
	return testFixture.callAPI("POST", "/v1/auth/recover", "", `{"code":"`+code+`"}`)
}

func TestRecoveryCodeReplacesTheSecretOnce(t *testing.T) {
	testFixture := newFixture(t)
	oldSecret := testFixture.registerPlayer("Vergesslich")
	testFixture.pokePlayer(oldSecret)
	state := testFixture.loadMe(oldSecret)

	recovery := decodeBody[store.RecoveryCode](t, testFixture.createRecoveryCode(state.ID, `{}`))
	if want := testFixture.clock.Load() + 24*60*60*1000; recovery.ExpiresAt != want {
		t.Fatalf("expires at %d, want %d", recovery.ExpiresAt, want)
	}
	if got := testFixture.callAPI("GET", "/v1/players/me", oldSecret, "").status; got != 200 {
		t.Fatalf("a new code alone must not lock anyone out: %d", got)
	}

	response := testFixture.recoverWith(recovery.Code)
	if response.status != http.StatusOK {
		t.Fatalf("recover: %d %s", response.status, response.body)
	}
	newState := testFixture.loadMe(decodeBody[registerResponse](t, response).Token)
	if newState.ID != state.ID || newState.XP != state.XP {
		t.Fatalf("state: %+v", newState)
	}
	requireProblem(t, testFixture.callAPI("GET", "/v1/players/me", oldSecret, ""),
		http.StatusUnauthorized, "unauthorized")
	requireProblem(t, testFixture.recoverWith(recovery.Code),
		http.StatusForbidden, "invalid_recovery_code")
}

func TestRecoveryCodeWorksWithoutALANAndEndsAtItsTime(t *testing.T) {
	testFixture := newFixture(t)
	playerID := testFixture.loadMe(testFixture.registerPlayer("Später")).ID
	testFixture.advanceClock(200 * time.Hour)

	short := decodeBody[store.RecoveryCode](t,
		testFixture.createRecoveryCode(playerID, `{"valid_seconds":60}`))
	testFixture.advanceClock(61 * time.Second)
	requireProblem(t, testFixture.recoverWith(short.Code),
		http.StatusForbidden, "invalid_recovery_code")

	first := decodeBody[store.RecoveryCode](t, testFixture.createRecoveryCode(playerID, `{}`))
	second := decodeBody[store.RecoveryCode](t, testFixture.createRecoveryCode(playerID, `{}`))
	requireProblem(t, testFixture.recoverWith(first.Code),
		http.StatusForbidden, "invalid_recovery_code")
	if got := testFixture.recoverWith(second.Code).status; got != http.StatusOK {
		t.Fatalf("the newest code recovers after the LAN: %d", got)
	}
}

func TestRecoveryCodeNeedsAnAccountAndASensibleTime(t *testing.T) {
	testFixture := newFixture(t)
	requireProblem(t, testFixture.createRecoveryCode(999, `{}`),
		http.StatusNotFound, "player_not_found")
	playerID := testFixture.loadMe(testFixture.registerPlayer("Zeit")).ID
	for _, body := range []string{`{"valid_seconds":0}`, `{"valid_seconds":99999999}`} {
		requireProblem(t, testFixture.createRecoveryCode(playerID, body),
			http.StatusBadRequest, "invalid_request")
	}
}

func TestSecretAfterTheLANOnlyReadsAndCustomizes(t *testing.T) {
	testFixture := newFixture(t)
	secret := testFixture.registerPlayer("A")
	testFixture.advanceClock(200 * 3_600_000_000_000)

	if got := testFixture.callAPI("GET", "/v1/players/me", secret, "").status; got != 200 {
		t.Fatalf("read own state: %d", got)
	}
	body := `{"color":"mint"}`
	if got := testFixture.callAPI("PATCH", "/v1/players/me", secret, body).status; got != 200 {
		t.Fatalf("customize: %d", got)
	}
	requireProblem(t, testFixture.callAPI("GET", "/v1/stage", secret, ""),
		http.StatusConflict, "no_active_lan")
	requireProblem(t, testFixture.callAPI("POST", "/v1/pokes", secret, ""),
		http.StatusConflict, "no_active_lan")
}

func TestProfilesNeedASecretAndHideHiddenPlayers(t *testing.T) {
	testFixture := newFixture(t)
	reader := testFixture.registerPlayer("Leser")
	shown := testFixture.registerPlayer("Glibber")
	shownID := strconv.FormatInt(testFixture.loadMe(shown).ID, 10)
	testFixture.pokePlayer(shown)

	requireProblem(t, testFixture.callAPI("GET", "/v1/players/"+shownID, "", ""),
		http.StatusUnauthorized, "unauthorized")
	response := testFixture.callAPI("GET", "/v1/players/"+shownID, reader, "")
	profile := decodeBody[store.PlayerProfile](t, response)
	if profile.Name != "Glibber" || profile.XP != 3 || len(profile.Achievements) == 0 {
		t.Fatalf("profile: %s", response.body)
	}

	first := decodeBody[store.PlayerList](t,
		testFixture.callAPI("GET", "/v1/players?limit=1", reader, ""))
	if len(first.Items) != 1 || first.NextCursor == nil {
		t.Fatalf("first page: %+v", first)
	}
	second := decodeBody[store.PlayerList](t, testFixture.callAPI("GET",
		"/v1/players?limit=1&cursor="+*first.NextCursor, reader, ""))
	if len(second.Items) != 1 || second.NextCursor != nil || second.Items[0].Name != "Glibber" {
		t.Fatalf("second page: %+v", second)
	}

	testFixture.callAdmin("POST", "/admin/api/players/"+shownID+"/hide", "")
	requireProblem(t, testFixture.callAPI("GET", "/v1/players/"+shownID, reader, ""),
		http.StatusNotFound, "player_not_found")
}

// createFutureLAN adds a LAN that starts after the one of the fixture has ended.
func (testFixture *fixture) createFutureLAN() {
	testFixture.t.Helper()
	startsAt := time.UnixMilli(testFixture.clock.Load()).Add(30 * 24 * time.Hour)
	err := testFixture.database.CreateLAN(testFixture.t.Context(), store.NewLAN{
		Slug: "next", Name: "Next", Timezone: "Europe/Berlin", JoinCode: "next-code",
		StartsAt: startsAt.UnixMilli(), EndsAt: startsAt.Add(24 * time.Hour).UnixMilli(),
		Rules: rules.DefaultRules(),
	})
	if err != nil {
		testFixture.t.Fatal(err)
	}
}

// redeemLANCode sends a shared code and returns the answer.
func (testFixture *fixture) redeemLANCode(code, name string) apiResponse {
	testFixture.t.Helper()
	return testFixture.callAPI("POST", "/v1/auth/redeem", "",
		`{"code":"`+code+`","name":"`+name+`","color":"mint"}`)
}

func TestLANCodeRegistersBeforeTheLANWithoutAnyXP(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.createFutureLAN()
	response := testFixture.redeemLANCode("next-code", "Early")
	if response.status != http.StatusOK {
		t.Fatalf("redeem: %d %s", response.status, response.body)
	}
	token := decodeBody[registerResponse](t, response).Token
	state := testFixture.loadMe(token)
	if len(state.Badges) != 0 || state.LANsAttended != 0 {
		t.Fatalf("nothing is attended yet: %+v", state)
	}
	requireProblem(t, testFixture.callAPI("POST", "/v1/pokes", token, ""),
		http.StatusConflict, "not_joined")

	testFixture.advanceClock(30*24*time.Hour + time.Hour)
	if xp := testFixture.pokePlayer(token); xp == 0 {
		t.Fatal("the entry counts once the LAN runs")
	}
	if badges := testFixture.loadMe(token).Badges; len(badges) != 1 {
		t.Fatalf("badges = %+v", badges)
	}
}

func TestRegisteredAccountStaysOffTheStageUntilItActs(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.createFutureLAN()
	token := decodeBody[registerResponse](t, testFixture.redeemLANCode("next-code", "Early")).Token
	testFixture.advanceClock(30*24*time.Hour + time.Hour)
	if players := testFixture.loadStage().Players; len(players) != 0 {
		t.Fatalf("players = %+v", players)
	}
	testFixture.pokePlayer(token)
	if players := testFixture.loadStage().Players; len(players) != 1 {
		t.Fatalf("players = %+v", players)
	}
}

func TestLANCodeAfterTheLANOnlyCreatesTheAccount(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.advanceClock(200 * time.Hour)
	response := testFixture.redeemLANCode(joinCode, "Late")
	if response.status != http.StatusOK {
		t.Fatalf("redeem: %d %s", response.status, response.body)
	}
	state := testFixture.loadMe(decodeBody[registerResponse](t, response).Token)
	if state.LAN != nil || len(state.Badges) != 0 {
		t.Fatalf("state = %+v", state)
	}
}

func TestWrongCodeIsRefusedWithoutARunningLAN(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.advanceClock(200 * time.Hour)
	requireProblem(
		t,
		testFixture.redeemLANCode("nope", "Late"),
		http.StatusForbidden,
		"invalid_code",
	)
}

func TestSeatCodeDoesNotSeatAnyoneInAZoneThatIsNoSeatAnymore(t *testing.T) {
	testFixture := newFixture(t)
	seatID := testFixture.createSeat(1)
	code := testFixture.issueCode(1, seatID, "{}")
	response := testFixture.callAdmin("PUT", "/admin/api/lans/1/areas/"+seatID,
		`{"x":40,"y":40,"width":5,"height":5,"kind":"none"}`)
	if response.status != http.StatusOK {
		t.Fatalf("change zone: %d %s", response.status, response.body)
	}
	answer := testFixture.redeem(map[string]string{"code": code, "name": "Spaet", "color": "mint"})
	if answer.status != http.StatusOK {
		t.Fatalf("redeem: %d %s", answer.status, answer.body)
	}
	if decodeBody[redeemAnswer](t, answer).SeatAssigned {
		t.Fatal("the code seated someone in a zone that is no seat")
	}
}
