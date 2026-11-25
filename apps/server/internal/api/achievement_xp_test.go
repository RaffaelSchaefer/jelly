package api_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

func TestEveryNewAchievementPaysItsXP(t *testing.T) {
	testFixture := newFixture(t)
	changed := testFixture.callAdmin("PATCH", "/admin/api/lans/1/rules", `{"achievement_xp":25}`)
	if changed.status != http.StatusOK {
		t.Fatalf("rules: %d %s", changed.status, changed.body)
	}
	token := testFixture.registerPlayer("Neu")
	// The first poke hatches the jelly, which is its first achievement.
	gained := testFixture.pokePlayer(token)
	state := testFixture.loadMe(token)
	earned := len(state.Achievements)
	if earned == 0 || gained != 6 || state.XP != 6+25*earned {
		t.Fatalf("xp %d after %d achievements: %+v", state.XP, earned, state.Achievements)
	}
	if testFixture.countEvents(
		store.EventXPGained,
		`{"amount":25,"source":"achievement"}`,
	) != earned {
		t.Fatal("the stage has to hear where the XP came from")
	}
	// An achievement comes only once, so a later poke pays only itself.
	testFixture.advanceClock(15 * time.Minute)
	testFixture.pokePlayer(token)
	if got := testFixture.loadMe(token); got.XP != state.XP+6 || len(got.Achievements) != earned {
		t.Fatalf("after a second poke: %d XP, %+v", got.XP, got.Achievements)
	}
}

func TestAchievementXPCanBeSwitchedOff(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Neu")
	testFixture.pokePlayer(token)
	if got := testFixture.loadMe(token).XP; got != 6 {
		t.Fatalf("without achievement XP: %d XP", got)
	}
}
