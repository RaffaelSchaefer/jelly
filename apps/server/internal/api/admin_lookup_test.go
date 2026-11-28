package api_test

import (
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

func TestAdminActionsNameLivingPlayersOnly(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Beleidigung")
	playerID := testFixture.loadMe(token).ID
	base := "/admin/api/players/" + strconv.FormatInt(playerID, 10)
	testFixture.callAdmin("POST", base+"/hide", "")

	actions := decodeBody[[]store.AdminAction](
		t,
		testFixture.callAdmin("GET", "/admin/api/actions", ""),
	)
	if len(actions) != 1 || actions[0].TargetName == nil ||
		*actions[0].TargetName != "Beleidigung" {
		t.Fatalf("the log should name the player: %+v", actions)
	}

	testFixture.callAdmin("DELETE", base, "")
	response := testFixture.callAdmin("GET", "/admin/api/actions", "")
	if strings.Contains(string(response.body), "Beleidigung") {
		t.Fatalf("a deleted account must leave no name in the log: %s", response.body)
	}
	actions = decodeBody[[]store.AdminAction](t, response)
	if len(actions) != 2 || actions[0].Action != store.AdminActionDelete {
		t.Fatalf("actions: %s", response.body)
	}
	if actions[1].TargetID == nil || *actions[1].TargetID != playerID {
		t.Fatalf("the log needs the target: %s", response.body)
	}
}

func TestAdminActionsNameNoPlayerForOtherTargets(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.registerPlayer("Erster")
	testFixture.callAdmin("PATCH", "/admin/api/lans/1/rules", `{"poke_xp":7}`)

	actions := decodeBody[[]store.AdminAction](
		t,
		testFixture.callAdmin("GET", "/admin/api/actions", ""),
	)
	if len(actions) != 1 || actions[0].TargetName != nil {
		t.Fatalf("a LAN action must not name a player: %+v", actions)
	}
}

func TestAdminFindsPlayersByNumber(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.registerPlayer("Anna")
	playerID := testFixture.loadMe(testFixture.registerPlayer("Bert")).ID
	number := strconv.FormatInt(playerID, 10)
	for _, search := range []string{number, "%23" + number, "Nr.%20" + number} {
		response := testFixture.callAdmin("GET", "/admin/api/players?search="+search, "")
		players := decodeBody[[]store.PlayerSummary](t, response)
		if !slices.ContainsFunc(players, func(player store.PlayerSummary) bool {
			return player.ID == playerID
		}) {
			t.Fatalf("search %q should find player %d: %s", search, playerID, response.body)
		}
	}
}
