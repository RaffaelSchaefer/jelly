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

// redeem exchanges a code for a secret.
func (testFixture *fixture) redeem(body map[string]string) apiResponse {
	testFixture.t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		testFixture.t.Fatal(err)
	}
	return testFixture.callAPI("POST", "/v1/auth/redeem", "", string(encoded))
}

// seatPlayerInSecondLAN assigns an account to a seat of the second LAN and returns its new secret.
func (testFixture *fixture) seatPlayerInSecondLAN(playerID int64) string {
	testFixture.t.Helper()
	code := testFixture.issueCode(2, testFixture.createSeat(2),
		`{"player_id":`+strconv.FormatInt(playerID, 10)+`}`)
	response := testFixture.redeem(map[string]string{"code": code})
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("redeem: %d %s", response.status, response.body)
	}
	return decodeBody[registerResponse](testFixture.t, response).Token
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
	secret := decodeBody[registerResponse](t, response).Token
	state := testFixture.loadMe(secret)
	if state.Name != "Sitzer" {
		t.Fatalf("state: %+v", state)
	}
	for _, player := range testFixture.loadStage().Players {
		if player.ID == state.ID && (player.AreaID == nil ||
			strconv.FormatInt(*player.AreaID, 10) != seatID) {
			t.Fatalf("the jelly is not on its seat: %+v", player)
		}
	}
	requireProblem(t, testFixture.redeem(map[string]string{
		"code": code, "name": "Dieb", "color": "mint",
	}), http.StatusConflict, "code_redeemed")
}

func TestNewSeatCodeBringsBackTheJellyAndEndsTheOldSecret(t *testing.T) {
	testFixture := newFixture(t)
	seatID := testFixture.createSeat(1)
	response := testFixture.redeem(map[string]string{
		"code": testFixture.issueCode(1, seatID, `{}`), "name": "Sitzer", "color": "mint",
	})
	oldSecret := decodeBody[registerResponse](t, response).Token
	testFixture.pokePlayer(oldSecret)

	response = testFixture.redeem(map[string]string{"code": testFixture.issueCode(1, seatID, `{}`)})
	newSecret := decodeBody[registerResponse](t, response).Token
	if state := testFixture.loadMe(newSecret); state.Name != "Sitzer" || state.XP != 3 {
		t.Fatalf("state: %+v", state)
	}
	requireProblem(t, testFixture.callAPI("GET", "/v1/players/me", oldSecret, ""),
		http.StatusUnauthorized, "unauthorized")

	codes := decodeBody[[]store.SeatCode](t,
		testFixture.callAdmin("GET", "/admin/api/lans/1/seat-codes", ""))
	if len(codes) != 1 || codes[0].UsedAt == nil || codes[0].Name == nil ||
		*codes[0].Name != "Sitzer" {
		t.Fatalf("codes: %+v", codes)
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
func (testFixture *fixture) createFutureLAN(code string) {
	testFixture.t.Helper()
	startsAt := time.UnixMilli(testFixture.clock.Load()).Add(30 * 24 * time.Hour)
	err := testFixture.database.CreateLAN(testFixture.t.Context(), store.NewLAN{
		Slug: "next", Name: "Next", Timezone: "Europe/Berlin", JoinCode: code,
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
	testFixture.createFutureLAN("next-code")
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
	testFixture.createFutureLAN("next-code")
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
