package api_test

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

// botListAnswer is the answer of `GET /admin/api/lans/{id}/bots`.
type botListAnswer struct {
	Bots []struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
		XP   int    `json:"xp"`
	} `json:"bots"`
	AutoCount int64 `json:"auto_count"`
}

// listBots reads the bots of the first LAN.
func (testFixture *fixture) listBots() botListAnswer {
	testFixture.t.Helper()
	response := testFixture.callAdmin("GET", "/admin/api/lans/1/bots", "")
	var answer botListAnswer
	if err := json.Unmarshal(
		response.body,
		&answer,
	); err != nil ||
		response.status != http.StatusOK {
		testFixture.t.Fatalf("list bots: %d %s", response.status, response.body)
	}
	return answer
}

func TestAdminCreatesBotsThatPlayLikePlayers(t *testing.T) {
	testFixture := newFixture(t)
	created := testFixture.callAdmin("POST", "/admin/api/lans/1/bots", `{"count":3}`)
	if created.status != http.StatusOK {
		t.Fatalf("create: %d %s", created.status, created.body)
	}
	bots := testFixture.listBots().Bots
	if len(bots) != 3 || !strings.HasPrefix(bots[0].Name, "Bot-") {
		t.Fatalf("bots: %+v", bots)
	}
	path := "/admin/api/bots/" + strconv.FormatInt(bots[0].ID, 10) + "/actions"
	for _, kind := range []string{"emote", "sign", "poke", "food", "trip", "follow"} {
		response := testFixture.callAdmin("POST", path, `{"kind":"`+kind+`"}`)
		// A trip may hit an obstacle, which a player could do as well.
		if response.status != http.StatusOK && kind != "trip" {
			t.Errorf("%s: %d %s", kind, response.status, response.body)
		}
	}
	if response := testFixture.callAdmin(
		"POST",
		path,
		`{"kind":"xp","xp":250}`,
	); response.status != http.StatusOK {
		t.Fatalf("xp: %d %s", response.status, response.body)
	}
	if xp := testFixture.listBots().Bots[0].XP; xp < 250 {
		t.Errorf("xp after the gift: %d", xp)
	}
	if response := testFixture.callAdmin(
		"POST",
		path,
		`{"kind":"dance"}`,
	); response.status != http.StatusBadRequest {
		t.Errorf("unknown action: %d %s", response.status, response.body)
	}
}

func TestAdminCannotControlRealPlayers(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.registerPlayer("Echt")
	response := testFixture.callAdmin("POST", "/admin/api/bots/1/actions", `{"kind":"emote"}`)
	if response.status != http.StatusBadRequest ||
		!strings.Contains(string(response.body), "not_a_bot") {
		t.Fatalf("real player: %d %s", response.status, response.body)
	}
}

func TestAutomaticBotsActAndStopWhenDeleted(t *testing.T) {
	testFixture := newFixture(t)
	if created := testFixture.callAdmin(
		"POST",
		"/admin/api/lans/1/bots",
		`{"count":5}`,
	); created.status != http.StatusOK {
		t.Fatalf("create: %d %s", created.status, created.body)
	}
	if response := testFixture.callAdmin(
		"PUT",
		"/admin/api/bots/auto",
		`{"count":5}`,
	); response.status != http.StatusOK {
		t.Fatalf("auto: %d %s", response.status, response.body)
	}
	if testFixture.listBots().AutoCount != 5 {
		t.Fatal("the auto count was not kept")
	}
	before := testFixture.callAdmin("GET", "/admin/api/actions", "")
	for range 200 {
		testFixture.advanceClock(time.Second)
		testFixture.service.PlayBotsForTest(t.Context())
	}
	stage := testFixture.loadStage()
	acted := 0
	for _, player := range stage.Players {
		if player.Sign != nil || player.Follow != nil {
			acted++
		}
	}
	if acted == 0 {
		t.Errorf("no bot acted in 200 seconds: %s", before.body)
	}
	deleted := testFixture.callAdmin("DELETE", "/admin/api/bots", "")
	if deleted.status != http.StatusOK || !strings.Contains(string(deleted.body), `"deleted":5`) {
		t.Fatalf("delete: %d %s", deleted.status, deleted.body)
	}
	if answer := testFixture.listBots(); len(answer.Bots) != 0 || answer.AutoCount != 0 {
		t.Errorf("after deleting: %+v", answer)
	}
}
