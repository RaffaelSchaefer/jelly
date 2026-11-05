package api_test

import (
	"bufio"
	"context"
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
)

// readStage returns the state of the stage with its moves.
func (testFixture *fixture) readStage(token string) api.StageAnswer {
	testFixture.t.Helper()
	response := testFixture.callAPI("GET", "/v1/stage", token, "")
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("stage: %d %s", response.status, response.body)
	}
	var answer api.StageAnswer
	err := json.Unmarshal(response.body, &answer)
	if err != nil {
		testFixture.t.Fatal(err)
	}
	return answer
}

// restartServer closes the database and builds a new server, whose planner knows nothing yet.
func (testFixture *fixture) restartServer() {
	testFixture.t.Helper()
	err := testFixture.database.Close()
	if err != nil {
		testFixture.t.Fatal(err)
	}
	testFixture.openDatabase()
}

// findOnlyMove returns the move of the only jelly in these tests.
func findOnlyMove(t *testing.T, answer api.StageAnswer) movement.Move {
	t.Helper()
	if len(answer.Moves) != 1 {
		t.Fatalf("moves = %+v", answer.Moves)
	}
	return answer.Moves[0]
}

func TestStageReportsWhereTheJellyStands(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	answer := testFixture.readStage(token)
	move := findOnlyMove(t, answer)
	if move.PlayerID != answer.Players[0].ID || move.Kind != movement.KindWander {
		t.Fatalf("move = %+v", move)
	}
	if len(move.Points) != 1 || move.Points[0].T != 0 {
		t.Fatalf("a new jelly stands, got %+v", move.Points)
	}
}

func TestFoodReportSendsTheJellyToTheQueue(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	response := testFixture.callAdmin("POST", "/admin/api/lans/1/areas",
		`{"x":60,"y":60,"width":20,"height":3,"kind":"queue"}`)
	if response.status != http.StatusOK {
		t.Fatalf("area: %d %s", response.status, response.body)
	}
	testFixture.readStage(token)
	testFixture.advanceClock(time.Second)
	testFixture.callAPI("POST", "/v1/reports", token, `{"kind":"food"}`)
	testFixture.advanceClock(time.Second)
	if kind := findOnlyMove(t, testFixture.readStage(token)).Kind; kind != movement.KindSnack {
		t.Fatalf("kind = %s", kind)
	}
	testFixture.advanceClock(time.Minute)
	if kind := findOnlyMove(t, testFixture.readStage(token)).Kind; kind != movement.KindWander {
		t.Fatalf("after the run, kind = %s", kind)
	}
}

// openTopicStream opens a stream with a query and returns its scanner.
func openTopicStream(
	ctx context.Context, t *testing.T, server *httptest.Server, query string,
) (*bufio.Scanner, int) {
	t.Helper()
	address := server.URL + "/v1/stage/events?key=" + stageKey + query
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = response.Body.Close() })
	return bufio.NewScanner(response.Body), response.StatusCode
}

func TestNewStreamReceivesTheCurrentMovesWithoutAnID(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.readStage(token)
	server := httptest.NewServer(testFixture.handler)
	defer server.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	scanner, status := openTopicStream(ctx, t, server, "&topics=moves")
	if status != http.StatusOK {
		t.Fatalf("status = %d", status)
	}
	if !scanner.Scan() || scanner.Text() != "event: move" {
		t.Fatalf("first line = %q", scanner.Text())
	}
	if !scanner.Scan() || !strings.HasPrefix(scanner.Text(), `data: {"player_id":`) {
		t.Fatalf("second line = %q", scanner.Text())
	}
}

func TestStreamRefusesAnUnknownTopic(t *testing.T) {
	testFixture := newFixture(t)
	server := httptest.NewServer(testFixture.handler)
	defer server.Close()
	_, status := openTopicStream(t.Context(), t, server, "&topics=gossip")
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d", status)
	}
}

func TestJellyContinuesWhereItStoodAfterARestart(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.readStage(token)
	testFixture.advanceClock(time.Second)
	testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":40,"y":60}`)
	testFixture.readStage(token)
	testFixture.advanceClock(time.Minute)
	testFixture.readStage(token)

	testFixture.restartServer()
	testFixture.advanceClock(time.Second)
	move := findOnlyMove(t, testFixture.readStage(token))
	first := move.Points[0]
	if move.Kind != movement.KindTrip || first.X != 40 || first.Y != 60 {
		t.Fatalf("move = %+v", move)
	}
}

func TestRestartAfterTheTripWasOverWalksHome(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	zoneID := testFixture.createArea(`{"x":60,"y":50,"width":20,"height":20,"kind":"seats"}`)
	playerID := strconv.FormatInt(testFixture.loadMe(token).ID, 10)
	testFixture.callAdmin("PUT", "/admin/api/lans/1/players/"+playerID+"/area",
		`{"area_id":`+zoneID+`}`)
	home := testFixture.readStage(token).Players[0].HomeSpot
	testFixture.advanceClock(time.Second)
	testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":40,"y":60}`)
	testFixture.readStage(token)
	testFixture.advanceClock(time.Minute)
	testFixture.readStage(token)

	testFixture.restartServer()
	testFixture.advanceClock(10 * time.Minute)
	testFixture.pokePlayer(token)
	move := findOnlyMove(t, testFixture.readStage(token))
	if first := move.Points[0]; first.X != 40 || first.Y != 60 {
		t.Fatalf("the jelly starts where it stood, got %+v", move)
	}
	testFixture.advanceClock(time.Minute)
	move = findOnlyMove(t, testFixture.readStage(token))
	end := move.Points[len(move.Points)-1]
	if math.Abs(end.X-home.X) > 15 || math.Abs(end.Y-home.Y) > 15 {
		t.Fatalf("still far from home %+v: %+v", home, move)
	}
}

func TestRestartKeepsTheStack(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.startStack(token)
	testFixture.readStage(token)
	testFixture.restartServer()
	testFixture.advanceClock(time.Second)
	answer := testFixture.readStage(token)
	if len(answer.Stacks) != 1 || findOnlyMove(t, answer).Kind != movement.KindStack {
		t.Fatalf("stage = %+v", answer)
	}
}

func TestJelliesKeepMovingWithoutAnyViewer(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.registerPlayer("A")
	service := api.NewService(api.Dependencies{
		Store:      testFixture.database,
		Now:        func() time.Time { return time.UnixMilli(testFixture.clock.Load()) },
		Logger:     slog.New(slog.DiscardHandler),
		IsStopping: testFixture.stopping.Load,
	})
	ctx, cancel := context.WithTimeout(t.Context(), 1200*time.Millisecond)
	defer cancel()
	service.RunMovement(ctx)
	state, err := testFixture.database.LoadStageState(t.Context(), testFixture.clock.Load())
	if err != nil {
		t.Fatal(err)
	}
	if state.Players[0].LastSpot == nil {
		t.Fatal("the planner ran without a viewer and should have saved the position")
	}
}
