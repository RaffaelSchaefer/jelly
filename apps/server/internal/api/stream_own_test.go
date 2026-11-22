package api_test

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

// streamData is what the test reads from one stream message.
type streamData struct {
	Type     string `json:"type"`
	PlayerID *int64 `json:"player_id"`
}

func TestOwnStreamLeavesOutOtherPlayers(t *testing.T) {
	testFixture := newFixture(t)
	own := testFixture.registerPlayer("Eigen")
	other := testFixture.registerPlayer("Fremd")
	ownID := testFixture.loadMe(own).ID
	testFixture.pokePlayer(other)
	testFixture.pokePlayer(own)
	server := httptest.NewServer(testFixture.handler)
	defer server.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet,
		server.URL+"/v1/stage/events?since=0&topics=own", http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+own)
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", response.StatusCode)
	}
	scanner := bufio.NewScanner(response.Body)
	sawSkippedID := false
	for scanner.Scan() {
		line := scanner.Text()
		if idText, found := strings.CutPrefix(line, "id: "); found {
			_, err = strconv.ParseInt(idText, 10, 64)
			sawSkippedID = sawSkippedID || err == nil
		}
		payload, found := strings.CutPrefix(line, "data: ")
		if !found {
			continue
		}
		var data streamData
		err = json.Unmarshal([]byte(payload), &data)
		if err != nil {
			t.Fatal(err)
		}
		if data.PlayerID == nil || *data.PlayerID != ownID {
			t.Fatalf("event of someone else: %s", payload)
		}
		if data.Type == "xp.gained" {
			break
		}
	}
	if !sawSkippedID {
		t.Fatal("the stream must move Last-Event-ID past the events of others")
	}
}

func TestStageCannotReadOwnEvents(t *testing.T) {
	testFixture := newFixture(t)
	server := httptest.NewServer(testFixture.handler)
	defer server.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet,
		server.URL+"/v1/stage/events?topics=own&key="+stageKey, http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d", response.StatusCode)
	}
}
