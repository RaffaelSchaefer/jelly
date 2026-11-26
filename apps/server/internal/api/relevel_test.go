package api_test

import (
	"net/http"
	"testing"
)

func TestARunningLANCanMoveItsLevelsOnRequest(t *testing.T) {
	testFixture := newFixture(t)
	const path = "/admin/api/lans/1/rules"
	const fasterLevels = `{"xp_curve":"linear","xp_per_level":5,"coins_per_level":2}`
	token := testFixture.registerPlayer("Früh")
	if xp := testFixture.pokePlayer(token); xp != 6 {
		t.Fatalf("poke = %d XP", xp)
	}
	if state := testFixture.loadMe(token); state.Level != 1 || state.Coins != 0 {
		t.Fatalf("before: level %d, %d coins", state.Level, state.Coins)
	}
	requireProblem(t, testFixture.callAdmin("PATCH", path, fasterLevels),
		http.StatusBadRequest, "invalid_rules")

	response := testFixture.callAdmin("PATCH", path+"?relevel=true", fasterLevels)
	if response.status != http.StatusOK {
		t.Fatalf("relevel: %d %s", response.status, response.body)
	}
	if state := testFixture.loadMe(token); state.Level != 2 || state.Coins != 2 {
		t.Fatalf(
			"6 XP at 5 XP per level is level 2 with 2 coins, got %d with %d",
			state.Level,
			state.Coins,
		)
	}

	// Slower levels again: the coins stay, and a second relevel pays nothing twice.
	response = testFixture.callAdmin("PATCH", path+"?relevel=true", `{"xp_per_level":100}`)
	if response.status != http.StatusOK {
		t.Fatalf("relevel back: %d %s", response.status, response.body)
	}
	if state := testFixture.loadMe(token); state.Level != 1 || state.Coins != 2 {
		t.Fatalf("after going back: level %d, %d coins", state.Level, state.Coins)
	}
	response = testFixture.callAdmin("PATCH", path+"?relevel=true", `{"xp_per_level":5}`)
	if response.status != http.StatusOK {
		t.Fatalf("relevel again: %d %s", response.status, response.body)
	}
	if state := testFixture.loadMe(token); state.Coins != 2 {
		t.Fatalf("level 2 was paid already, got %d coins", state.Coins)
	}
}
