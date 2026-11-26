package api_test

import (
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// giveProgress gives a player XP and coins through the admin routes and returns the player ID.
func (testFixture *fixture) giveProgress(token string) int64 {
	testFixture.t.Helper()
	const givenXP, givenCoins = 500, 20
	playerID := testFixture.loadMe(token).ID
	base := "/admin/api/players/" + strconv.FormatInt(playerID, 10)
	for path, body := range map[string]string{
		base + "/xp":    `{"xp":` + strconv.Itoa(givenXP) + `}`,
		base + "/coins": `{"coins":` + strconv.Itoa(givenCoins) + `}`,
	} {
		response := testFixture.callAdmin("POST", path, body)
		if response.status != http.StatusOK {
			testFixture.t.Fatalf("give %s: %d %s", path, response.status, response.body)
		}
	}
	return playerID
}

func TestResetOneAccountLeavesTheOthers(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("Eins")
	second := testFixture.registerPlayer("Zwei")
	firstID := testFixture.giveProgress(first)
	testFixture.giveProgress(second)
	before := testFixture.loadMe(second)
	if before.XP == 0 || before.Coins == 0 {
		t.Fatalf("the fixture gave nothing: %+v", before)
	}

	response := testFixture.callAdmin("POST",
		"/admin/api/lans/1/players/"+strconv.FormatInt(firstID, 10)+"/reset", "")
	if response.status != http.StatusOK {
		t.Fatalf("reset: %d %s", response.status, response.body)
	}
	state := testFixture.loadMe(first)
	if state.XP != 0 || state.Coins != 0 || state.Level != 1 || state.Name != "Eins" {
		t.Fatalf("after reset: %+v", state)
	}
	if got := testFixture.loadMe(second); got.XP != before.XP || got.Coins != before.Coins {
		t.Fatalf("the other account changed: %+v", got)
	}
	if testFixture.countEvents(store.EventPlayerUpdated, `{}`) == 0 {
		t.Fatal("the app has to hear about the reset")
	}
}

func TestResetAllAccountsKeepsThemUsable(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("Eins")
	second := testFixture.registerPlayer("Zwei")
	testFixture.giveProgress(first)
	testFixture.giveProgress(second)

	response := testFixture.callAdmin("POST", "/admin/api/lans/1/reset", "")
	if response.status != http.StatusOK {
		t.Fatalf("reset all: %d %s", response.status, response.body)
	}
	for _, token := range []string{first, second} {
		state := testFixture.loadMe(token)
		if state.XP != 0 || state.Coins != 0 || state.Level != 1 {
			t.Fatalf("after reset: %+v", state)
		}
	}
	testFixture.advanceClock(15 * time.Minute)
	if gained := testFixture.pokePlayer(first); gained == 0 {
		t.Fatal("a reset account has to earn XP again")
	}
}

func TestResetNamesUnknownLANAndPlayer(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Eins")
	playerID := strconv.FormatInt(testFixture.loadMe(token).ID, 10)
	requireProblem(t, testFixture.callAdmin("POST", "/admin/api/lans/99/reset", ""),
		404, "lan_not_found")
	requireProblem(t, testFixture.callAdmin("POST",
		"/admin/api/lans/99/players/"+playerID+"/reset", ""), 404, "lan_not_found")
	requireProblem(t, testFixture.callAdmin("POST",
		"/admin/api/lans/1/players/999/reset", ""), 404, "player_not_found")
}
