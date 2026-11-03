package api_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
)

// openStream opens the event stream with a token, or with the stage key without one. It returns
// the status and the body of a refusal. An accepted stream stays open until the test ends.
func openStream(
	ctx context.Context, t *testing.T, server *httptest.Server, token string,
) (int, []byte) {
	t.Helper()
	address := server.URL + "/v1/events/stream"
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
