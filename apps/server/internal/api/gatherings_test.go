package api_test

import (
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const gatheringPath = "/admin/api/lans/1/gathering"

// findMoveOf returns the current move of one jelly.
func (testFixture *fixture) findMoveOf(token string, playerID int64) movement.Move {
	testFixture.t.Helper()
	testFixture.advanceClock(2 * time.Second)
	for _, move := range testFixture.readStage(token).Moves {
		if move.PlayerID == playerID {
			return move
		}
	}
	testFixture.t.Fatalf("jelly %d has no move", playerID)
	return movement.Move{}
}

func TestFoodEventSendsEveryoneToTheQueueAndTheirTripGoesOn(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Hungrig")
	playerID := testFixture.loadMe(token).ID
	testFixture.createArea(`{"x":60,"y":60,"width":30,"height":30,"kind":"queue"}`)
	testFixture.readStage(token)
	if got := testFixture.callAPI(
		"POST",
		"/v1/trips/goto",
		token,
		`{"x":10,"y":10}`,
	).status; got != 200 {
		t.Fatalf("trip: %d", got)
	}
	if kind := testFixture.findMoveOf(token, playerID).Kind; kind != movement.KindTrip {
		t.Fatalf("kind before = %s", kind)
	}

	response := testFixture.callAdmin("POST", gatheringPath, `{"kind":"food","seconds":60}`)
	if response.status != http.StatusOK {
		t.Fatalf("start: %d %s", response.status, response.body)
	}
	if kind := testFixture.findMoveOf(token, playerID).Kind; kind != movement.KindFood {
		t.Fatalf("kind during = %s", kind)
	}
	stage := testFixture.readStage(token)
	if stage.Gathering == nil || stage.Gathering.Kind != "food" {
		t.Fatalf("gathering = %+v", stage.Gathering)
	}

	testFixture.advanceClock(61 * time.Second)
	if kind := testFixture.findMoveOf(token, playerID).Kind; kind != movement.KindTrip {
		t.Fatalf("the trip goes on afterwards, kind = %s", kind)
	}
	if stage = testFixture.readStage(token); stage.Gathering != nil {
		t.Fatalf("gathering = %+v", stage.Gathering)
	}
}

func TestCeremonySeparatesTheWinnerFromTheSpectators(t *testing.T) {
	testFixture := newFixture(t)
	winner := testFixture.registerPlayer("Sieger")
	viewer := testFixture.registerPlayer("Zuschauer")
	winnerID := testFixture.loadMe(winner).ID
	viewerID := testFixture.loadMe(viewer).ID
	testFixture.createArea(`{"x":45,"y":5,"width":10,"height":10,"kind":"winner"}`)
	testFixture.createArea(`{"x":10,"y":70,"width":80,"height":20,"kind":"spectators"}`)
	testFixture.readStage(winner)

	response := testFixture.callAdmin("POST", gatheringPath,
		`{"kind":"ceremony","seconds":60,"winner_id":`+strconv.FormatInt(winnerID, 10)+`}`)
	if response.status != http.StatusOK {
		t.Fatalf("start: %d %s", response.status, response.body)
	}
	winnerMove := testFixture.findMoveOf(winner, winnerID)
	viewerMove := testFixture.findMoveOf(winner, viewerID)
	if winnerMove.Kind != movement.KindCeremony || viewerMove.Kind != movement.KindCeremony {
		t.Fatalf("kinds: %s %s", winnerMove.Kind, viewerMove.Kind)
	}
	winnerEnd := winnerMove.Points[len(winnerMove.Points)-1]
	viewerEnd := viewerMove.Points[len(viewerMove.Points)-1]
	if winnerEnd.Y > 15 || viewerEnd.Y < 70 {
		t.Fatalf("winner at %+v, viewer at %+v", winnerEnd, viewerEnd)
	}
}

func TestGatheringEndsEarlyAndSurvivesARestart(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Hungrig")
	testFixture.createArea(`{"x":60,"y":60,"width":30,"height":30,"kind":"queue"}`)
	testFixture.callAdmin("POST", gatheringPath, `{"kind":"food","seconds":600}`)

	testFixture.restartServer()
	if testFixture.readStage(token).Gathering == nil {
		t.Fatal("a restart must not end it")
	}
	response := testFixture.callAdmin("DELETE", gatheringPath, "")
	if response.status != http.StatusOK {
		t.Fatalf("end: %d %s", response.status, response.body)
	}
	if testFixture.readStage(token).Gathering != nil {
		t.Fatal("it should be over")
	}
	requireProblem(t, testFixture.callAdmin("DELETE", gatheringPath, ""),
		http.StatusNotFound, "gathering_not_found")
}

func TestGatheringNeedsSensibleInput(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.registerPlayer("Da")
	for _, body := range []string{
		`{"kind":"party","seconds":60}`,
		`{"kind":"food","seconds":0}`,
		`{"kind":"food","seconds":99999}`,
		`{"kind":"food","seconds":60,"winner_id":1}`,
	} {
		requireProblem(t, testFixture.callAdmin("POST", gatheringPath, body),
			http.StatusBadRequest, "invalid_input")
	}
	requireProblem(t, testFixture.callAdmin("POST", gatheringPath,
		`{"kind":"ceremony","seconds":60,"winner_id":999}`), http.StatusConflict, "not_joined")
	requireProblem(t, testFixture.callAdmin("POST", "/admin/api/lans/99/gathering",
		`{"kind":"food","seconds":60}`), http.StatusNotFound, "lan_not_found")
}

func TestHighlightNamesItsAura(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Hell")
	body := testFixture.playerBody(token)
	testFixture.readStage(token)
	if got := testFixture.callAPI("POST", "/v1/highlights", token, body).status; got != 200 {
		t.Fatalf("highlight: %d", got)
	}
	events, err := testFixture.database.ListEventsAfter(t.Context(), 0)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, event := range events {
		found = found || (event.Type == store.EventHighlight &&
			strings.Contains(string(event.Payload), `"cosmetic_key":"highlight-aura"`))
	}
	if !found {
		t.Fatal("the event has to name the aura")
	}
}
