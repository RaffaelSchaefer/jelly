package api_test

import (
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

func TestXPEventsNameTheirSource(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.callAPI("POST", "/v1/reports", token, `{"kind":"food"}`)
	events, err := testFixture.database.ListEventsAfter(t.Context(), 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range events {
		if event.Type == store.EventXPGained {
			if string(event.Payload) != `{"amount":15,"source":"food"}` {
				t.Fatalf("payload = %s", event.Payload)
			}
			return
		}
	}
	t.Fatal("the stage needs the XP event")
}
