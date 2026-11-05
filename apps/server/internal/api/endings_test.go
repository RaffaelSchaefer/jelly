package api_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const (
	endedTrip   = `null`
	endedFollow = `{"target_id":null}`
)

// countEvents returns how many events of a type with this payload were sent.
func (testFixture *fixture) countEvents(eventType, payload string) int {
	testFixture.t.Helper()
	events, err := testFixture.database.ListEventsAfter(testFixture.t.Context(), 0)
	if err != nil {
		testFixture.t.Fatal(err)
	}
	found := 0
	for _, event := range events {
		if event.Type == eventType && string(event.Payload) == payload {
			found++
		}
	}
	return found
}

// letTimeRunOut moves past a moment and reads the stage, as every open screen does.
func (testFixture *fixture) letTimeRunOut(endsAt int64) {
	testFixture.t.Helper()
	testFixture.advanceClock(
		time.Duration(endsAt-testFixture.clock.Load())*time.Millisecond + time.Second,
	)
	testFixture.loadStage()
}

func TestATripThatRunsOutIsAnnouncedOnce(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Reist")
	response := testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":40,"y":60}`)
	testFixture.letTimeRunOut(decodeBody[store.PlayerState](t, response).Trip.EndsAt)
	testFixture.advanceClock(time.Second)
	testFixture.loadStage()
	if got := testFixture.countEvents(store.EventTripChanged, endedTrip); got != 1 {
		t.Fatalf("end of the trip announced %d times", got)
	}
}

func TestFollowingThatRunsOutIsAnnouncedOnce(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Folgt")
	target := testFixture.registerPlayer("Vorne")
	state := decodeBody[store.PlayerState](t, testFixture.follow(token, target))
	testFixture.letTimeRunOut(state.Follow.EndsAt)
	testFixture.advanceClock(time.Second)
	testFixture.loadStage()
	if got := testFixture.countEvents(store.EventFollowChanged, endedFollow); got != 1 {
		t.Fatalf("end of following announced %d times", got)
	}
	if follow := testFixture.loadMe(token).Follow; follow != nil {
		t.Fatalf("still follows %+v", follow)
	}
}

func TestAHiddenJellyEndsWithoutAnEvent(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Versteckt")
	response := testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":40,"y":60}`)
	endsAt := decodeBody[store.PlayerState](t, response).Trip.EndsAt
	testFixture.callAdmin("POST", "/admin/api/players/1/hide", "")
	testFixture.letTimeRunOut(endsAt)
	if got := testFixture.countEvents(store.EventTripChanged, endedTrip); got != 0 {
		t.Fatalf("end of the trip announced %d times", got)
	}
}

func TestAStackThatRunsOutIsAnnouncedAndGone(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Stapelt")
	testFixture.startStack(token)
	stacks := testFixture.loadStage().Stacks
	if len(stacks) != 1 {
		t.Fatalf("stacks: %+v", stacks)
	}
	testFixture.letTimeRunOut(stacks[0].EndsAt)
	if got := testFixture.countEvents(store.EventStackChanged, `{"id":1}`); got != 1 {
		t.Fatalf("end of the stack announced %d times", got)
	}
	response := testFixture.callAPI("DELETE", "/v1/stacks/current", token, "")
	if response.status != http.StatusOK {
		t.Fatalf("the jelly has to be off the stack: %d %s", response.status, response.body)
	}
}

func TestAGatheringThatRunsOutIsAnnounced(t *testing.T) {
	testFixture := newFixture(t)
	response := testFixture.callAdmin("POST", "/admin/api/lans/1/gathering",
		`{"kind":"food","seconds":60}`)
	testFixture.letTimeRunOut(decodeBody[store.Gathering](t, response).EndsAt)
	if got := testFixture.countEvents(store.EventGatheringChanged, `null`); got != 1 {
		t.Fatalf("end of the gathering announced %d times", got)
	}
}

func TestEveryWayOutOfAWalkIsAnnounced(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Wechselt")
	target := testFixture.registerPlayer("Ziel")
	goTo := func() { testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":40,"y":60}`) }

	testFixture.follow(token, target)
	goTo()
	if got := testFixture.countEvents(store.EventFollowChanged, endedFollow); got != 1 {
		t.Fatalf("a trip ends following, announced %d times", got)
	}
	testFixture.follow(token, target)
	if got := testFixture.countEvents(store.EventTripChanged, endedTrip); got != 1 {
		t.Fatalf("following ends a trip, announced %d times", got)
	}
	testFixture.callAPI("DELETE", "/v1/trips/current", token, "")
	if got := testFixture.countEvents(store.EventFollowChanged, endedFollow); got != 2 {
		t.Fatalf("going back ends following, announced %d times", got)
	}
	goTo()
	testFixture.callAPI("POST", "/v1/stacks", token, "")
	if got := testFixture.countEvents(store.EventTripChanged, endedTrip); got != 2 {
		t.Fatalf("a stack ends a trip, announced %d times", got)
	}
}
