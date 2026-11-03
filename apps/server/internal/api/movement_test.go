package api_test

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

func TestFoodReportSendsTheJellyToTheSnackBar(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	response := testFixture.callAdmin("POST", "/admin/api/lans/1/areas",
		`{"x":60,"y":60,"width":20,"height":3,"kind":"snackbar"}`)
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
	testFixture.advanceClock(15 * time.Second)
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
