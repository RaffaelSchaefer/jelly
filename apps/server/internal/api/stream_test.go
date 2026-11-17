package api_test

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// openStream opens the event stream with a token, or with the stage key without one. It returns
// the status and the body of a refusal. An accepted stream stays open until the test ends.
func openStream(
	ctx context.Context, t *testing.T, server *httptest.Server, token string,
) (int, []byte) {
	t.Helper()
	address := server.URL + "/v1/stage/events"
	if token == "" {
		address += "?key=" + stageKey
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = response.Body.Close() })
	if response.StatusCode == http.StatusOK {
		return response.StatusCode, nil
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response.StatusCode, body
}

// requireStreamOpens checks that the limits let a stream through.
func requireStreamOpens(
	ctx context.Context, t *testing.T, server *httptest.Server, token string,
) {
	t.Helper()
	status, body := openStream(ctx, t, server, token)
	if status != http.StatusOK {
		t.Fatalf("status = %d: %s", status, body)
	}
}

// requireStreamRefused checks that a stream is refused in the common error form.
func requireStreamRefused(
	ctx context.Context, t *testing.T, server *httptest.Server, token string,
) {
	t.Helper()
	status, body := openStream(ctx, t, server, token)
	if status != http.StatusTooManyRequests {
		t.Fatalf("status = %d: %s", status, body)
	}
	var answer api.ErrorResponse
	err := json.Unmarshal(body, &answer)
	if err != nil || answer.Error.Code != "rate_limited" {
		t.Fatalf("answer = %s, %v", body, err)
	}
}

func TestStreamLimitsFollowTheRulesOfTheLAN(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	third := testFixture.registerPlayer("C")
	gameRules := testFixture.loadRules()
	gameRules["max_player_streams"] = 1
	gameRules["max_streams"] = 2
	body, err := json.Marshal(gameRules)
	if err != nil {
		t.Fatal(err)
	}
	response := testFixture.callAdmin("PUT", "/admin/api/lans/1/rules", string(body))
	if response.status != http.StatusOK {
		t.Fatalf("set rules: %d %s", response.status, response.body)
	}
	server := httptest.NewServer(testFixture.handler)
	defer server.Close()
	defer server.CloseClientConnections()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	firstCtx, closeFirst := context.WithCancel(ctx)
	defer closeFirst()
	requireStreamOpens(firstCtx, t, server, first)
	requireStreamRefused(ctx, t, server, first)
	requireStreamOpens(ctx, t, server, second)
	requireStreamRefused(ctx, t, server, third)
	requireStreamOpens(ctx, t, server, "")

	closeFirst()
	requireStreamReopens(ctx, t, server, first)
}

// requireStreamReopens waits until the server has noticed a closed stream and freed its slot.
func requireStreamReopens(
	ctx context.Context, t *testing.T, server *httptest.Server, token string,
) {
	t.Helper()
	for ctx.Err() == nil {
		status, body := openStream(ctx, t, server, token)
		if status == http.StatusOK {
			return
		}
		if status != http.StatusTooManyRequests {
			t.Fatalf("status = %d: %s", status, body)
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("the closed stream was never released")
}

func TestVersionWorksWithoutAnAccountOutsideTheVersionPath(t *testing.T) {
	testFixture := newFixture(t)
	response := testFixture.callAPI("GET", "/version", "", "")
	if response.status != http.StatusOK {
		t.Fatalf("status = %d: %s", response.status, response.body)
	}
	var version api.VersionInfo
	err := json.Unmarshal(response.body, &version)
	if err != nil {
		t.Fatal(err)
	}
	if version.APIVersion != api.APIVersion || version.MinClientVersion != minClientVersion {
		t.Fatalf("version = %+v", version)
	}
	if got := testFixture.callAPI("GET", "/v1/version", "", "").status; got != http.StatusNotFound {
		t.Fatalf("versioned path = %d", got)
	}
}

// readStreamEvents reads SSE lines until `count` events arrived.
func readStreamEvents(t *testing.T, scanner *bufio.Scanner, count int) []string {
	t.Helper()
	types := []string{}
	for len(types) < count && scanner.Scan() {
		if eventType, found := strings.CutPrefix(scanner.Text(), "event: "); found {
			types = append(types, eventType)
		}
	}
	if len(types) < count {
		t.Fatalf("stream ended after %v: %v", types, scanner.Err())
	}
	return types
}

func TestStreamDeliversReplaysAndStops(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	server := httptest.NewServer(testFixture.handler)
	defer server.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet,
		server.URL+"/v1/stage/events?since=0&topics=events&key="+stageKey, http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	if got := response.Header.Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("content type = %q", got)
	}
	scanner := bufio.NewScanner(response.Body)
	replayed := readStreamEvents(t, scanner, 1)
	if replayed[0] != store.EventPlayerActive {
		t.Fatalf("replay = %v", replayed)
	}

	testFixture.callAPI("POST", "/v1/emotes", token, `{"key":"wave"}`)
	live := readStreamEvents(t, scanner, 1)
	if live[0] != store.EventEmote {
		t.Fatalf("live = %v", live)
	}

	testFixture.stopping.Store(true)
	for scanner.Scan() {
		continue
	}
	if err := ctx.Err(); err != nil {
		t.Fatalf("stream did not end when the server stopped: %v", err)
	}
}

// pumpStageChanged writes `count` `stage.changed` events, so the replay window of a player starts
// past the first event of the log.
func (testFixture *fixture) pumpStageChanged(count int) {
	testFixture.t.Helper()
	area := store.AdminArea{Width: 50, Height: 50, Kind: rules.AreaKindSeats}
	stored, err := testFixture.database.CreateArea(
		testFixture.t.Context(), 1, area, testFixture.clock.Load(),
	)
	if err != nil {
		testFixture.t.Fatal(err)
	}
	for range count {
		_, err = testFixture.database.UpdateArea(
			testFixture.t.Context(), 1, stored, testFixture.clock.Load(),
		)
		if err != nil {
			testFixture.t.Fatal(err)
		}
	}
}

// newStreamRequest builds a stream request with `query`, as a player or as the stage page.
func newStreamRequest(
	ctx context.Context, server *httptest.Server, token string, query url.Values,
) (*http.Request, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet,
		server.URL+"/v1/stage/events?"+query.Encode(), http.NoBody)
	if err != nil {
		return nil, err
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	return request, nil
}

// readOpenedStream sends the request and returns a scanner over its messages.
func readOpenedStream(t *testing.T, server *httptest.Server, request *http.Request) *bufio.Scanner {
	t.Helper()
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = response.Body.Close() })
	if response.StatusCode != http.StatusOK {
		body, readErr := io.ReadAll(response.Body)
		if readErr != nil {
			t.Fatal(readErr)
		}
		t.Fatalf("open stream: %d %s", response.StatusCode, body)
	}
	return bufio.NewScanner(response.Body)
}

// openStreamWithQuery opens the event stream at a cursor over `?since=`. The body stays open
// until the test ends.
func openStreamWithQuery(
	ctx context.Context, t *testing.T, server *httptest.Server, token, cursor string,
) *bufio.Scanner {
	t.Helper()
	query := url.Values{"topics": {"events"}, "since": {cursor}}
	if token == "" {
		query.Set("key", stageKey)
	}
	request, err := newStreamRequest(ctx, server, token, query)
	if err != nil {
		t.Fatal(err)
	}
	return readOpenedStream(t, server, request)
}

// openStreamWithHeader opens the event stream of a player that reconnected with `Last-Event-ID`.
func openStreamWithHeader(
	ctx context.Context, t *testing.T, server *httptest.Server, token, cursor string,
) *bufio.Scanner {
	t.Helper()
	request, err := newStreamRequest(ctx, server, token, url.Values{"topics": {"events"}})
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Last-Event-ID", cursor)
	return readOpenedStream(t, server, request)
}

func TestStreamResetsCursorsAheadOfTheNewestEvent(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	server := httptest.NewServer(testFixture.handler)
	defer server.Close()
	defer server.CloseClientConnections()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	response := testFixture.callAPI("GET", "/v1/stage?key="+stageKey, "", "")
	latestID := decodeBody[api.StageAnswer](t, response).LastEventID
	if latestID < 1 {
		t.Fatalf("latest event ID = %d", latestID)
	}
	ahead := strconv.FormatInt(latestID+1, 10)
	fromHeader := openStreamWithHeader(ctx, t, server, token, ahead)
	if got := readStreamEvents(t, fromHeader, 1)[0]; got != "reset" {
		t.Fatalf("player ahead over the header: %q", got)
	}
	fromQuery := openStreamWithQuery(ctx, t, server, "", ahead)
	if got := readStreamEvents(t, fromQuery, 1)[0]; got != "reset" {
		t.Fatalf("stage ahead over the query: %q", got)
	}
	// The largest cursor still parses and counts as ahead, instead of failing the request.
	const largestCursor = "9223372036854775806"
	fromLargest := openStreamWithQuery(ctx, t, server, "", largestCursor)
	if got := readStreamEvents(t, fromLargest, 1)[0]; got != "reset" {
		t.Fatalf("stage with the largest cursor: %q", got)
	}
	// A cursor equal to the newest event is not ahead of it, so no reset precedes the next event.
	current := openStreamWithQuery(ctx, t, server, token, strconv.FormatInt(latestID, 10))
	testFixture.callAPI("POST", "/v1/emotes", token, `{"key":"wave"}`)
	if got := readStreamEvents(t, current, 1)[0]; got != store.EventEmote {
		t.Fatalf("player at the newest event: %q", got)
	}
	replayed := openStreamWithQuery(ctx, t, server, "", strconv.FormatInt(latestID-1, 10))
	// The replay carries the event before the cursor and the emote from the case above.
	messages := readStreamEvents(t, replayed, 2)
	if messages[0] == "reset" || messages[1] != store.EventEmote {
		t.Fatalf("stage within the window: %q", messages)
	}
}

func TestStreamResetsPlayersTooFarBehind(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	// One more event than the replay window of 1000 pushes its start past the beginning.
	testFixture.pumpStageChanged(1001)
	server := httptest.NewServer(testFixture.handler)
	defer server.Close()
	defer server.CloseClientConnections()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	fromStart := openStreamWithQuery(ctx, t, server, token, "0")
	if got := readStreamEvents(t, fromStart, 1)[0]; got != "reset" {
		t.Fatalf("player too far behind: %q", got)
	}
	anonymous := openStreamWithQuery(ctx, t, server, "", "0")
	if got := readStreamEvents(t, anonymous, 1)[0]; got == "reset" {
		t.Fatalf("stage too far behind: %q", got)
	}
}

func TestStreamKeepsRejectingCursorsBeyondInt64(t *testing.T) {
	testFixture := newFixture(t)
	server := httptest.NewServer(testFixture.handler)
	defer server.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	// One above the largest int64 is not a cursor anymore, so it stays an invalid input.
	request, err := newStreamRequest(ctx, server, "", url.Values{
		"topics": {"events"}, "key": {stageKey}, "since": {"9223372036854775808"},
	})
	if err != nil {
		t.Fatal(err)
	}
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	var answer api.ErrorResponse
	if err := json.Unmarshal(body, &answer); err != nil || answer.Error.Code != "invalid_request" {
		t.Fatalf("answer = %s, %v", body, err)
	}
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d: %s", response.StatusCode, body)
	}
}
