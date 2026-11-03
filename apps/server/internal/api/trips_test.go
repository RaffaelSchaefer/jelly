package api_test

import (
	"encoding/json"
	"net/http"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// playerBody names a jelly by the token of its player.
func (testFixture *fixture) playerBody(token string) string {
	testFixture.t.Helper()
	return `{"player_id":` + strconv.FormatInt(testFixture.loadMe(token).ID, 10) + `}`
}

// follow lets one jelly follow another and returns the answer.
func (testFixture *fixture) follow(token, target string) apiResponse {
	testFixture.t.Helper()
	return testFixture.callAPI("POST", "/v1/trips/follow", token, testFixture.playerBody(target))
}

func TestTripWalksThereAndBackAfterItsTime(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.readStage(token)
	testFixture.advanceClock(time.Second)
	response := testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":40,"y":60}`)
	state := decodeBody[store.PlayerState](t, response)
	want := testFixture.clock.Load() + (5 * time.Minute).Milliseconds()
	if state.Trip == nil || state.Trip.X != 40 || state.Trip.Until != want {
		t.Fatalf("trip = %+v", state.Trip)
	}
	testFixture.advanceClock(time.Second)
	move := findOnlyMove(t, testFixture.readStage(token))
	last := move.Points[len(move.Points)-1]
	if move.Kind != movement.KindTrip || last.X != 40 || last.Y != 60 {
		t.Fatalf("move = %+v", move)
	}
	testFixture.advanceClock(5 * time.Minute)
	if move = findOnlyMove(t, testFixture.readStage(token)); move.Kind != movement.KindWander {
		t.Fatalf("after the trip, move = %+v", move)
	}
	if trip := testFixture.loadMe(token).Trip; trip != nil {
		t.Fatalf("the trip is over: %+v", trip)
	}
}

func TestTripRefusesAPointOutsideTheStage(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	response := testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":101,"y":60}`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_trip")
}

func TestEndingATripWalksHomeAtOnce(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":40,"y":60}`)
	response := testFixture.callAPI("DELETE", "/v1/trips/current", token, "")
	if state := decodeBody[store.PlayerState](t, response); state.Trip != nil {
		t.Fatalf("trip = %+v", state.Trip)
	}
}

func TestFollowingSomeoneNewWaitsForTheCooldown(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	first := testFixture.registerPlayer("B")
	second := testFixture.registerPlayer("C")
	state := decodeBody[store.PlayerState](t, testFixture.follow(token, first))
	want := testFixture.clock.Load() + (30 * time.Minute).Milliseconds()
	if state.NextFollowAt == nil || *state.NextFollowAt != want {
		t.Fatalf("next follow = %v, want %d", state.NextFollowAt, want)
	}
	requireProblem(t, testFixture.follow(token, second), http.StatusConflict, "follow_cooldown")
	testFixture.callAPI("DELETE", "/v1/trips/current", token, "")
	requireProblem(t, testFixture.follow(token, second), http.StatusConflict, "follow_cooldown")
	testFixture.advanceClock(30 * time.Minute)
	if response := testFixture.follow(token, second); response.status != http.StatusOK {
		t.Fatalf("follow: %d %s", response.status, response.body)
	}
}

func TestJelliesCannotFollowInACircle(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	third := testFixture.registerPlayer("C")
	testFixture.follow(first, second)
	testFixture.follow(second, third)
	requireProblem(t, testFixture.follow(third, first), http.StatusBadRequest, "invalid_follow")
}

func TestStartingATripEndsFollowing(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.follow(token, testFixture.registerPlayer("B"))
	response := testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":40,"y":60}`)
	if state := decodeBody[store.PlayerState](t, response); state.FollowPlayerID != nil {
		t.Fatalf("still follows %d", *state.FollowPlayerID)
	}
}

func TestTwoFollowersOfOneJellyEarnConga(t *testing.T) {
	testFixture := newFixture(t)
	front := testFixture.registerPlayer("A")
	first := testFixture.registerPlayer("B")
	second := testFixture.registerPlayer("C")
	testFixture.follow(first, front)
	if slices.Contains(findAchievementKeys(testFixture.loadMe(first)), rules.AchievementConga) {
		t.Fatal("one follower is no line yet")
	}
	testFixture.follow(second, front)
	for _, token := range []string{front, first, second} {
		keys := findAchievementKeys(testFixture.loadMe(token))
		if !slices.Contains(keys, rules.AchievementConga) {
			t.Fatalf("achievements = %v", keys)
		}
	}
}

func TestFollowingAFollowerEarnsConga(t *testing.T) {
	testFixture := newFixture(t)
	front := testFixture.registerPlayer("A")
	middle := testFixture.registerPlayer("B")
	back := testFixture.registerPlayer("C")
	testFixture.follow(middle, front)
	testFixture.follow(back, middle)
	keys := findAchievementKeys(testFixture.loadMe(back))
	if !slices.Contains(keys, rules.AchievementConga) {
		t.Fatalf("achievements = %v", keys)
	}
}

func TestPartnerEmoteNeedsToStandNearby(t *testing.T) {
	testFixture := newFixture(t)
	gameRules := rules.DefaultRules()
	gameRules.NearDistance = 3
	body, err := json.Marshal(gameRules)
	if err != nil {
		t.Fatal(err)
	}
	testFixture.callAdmin("PUT", "/admin/api/lans/1/rules", string(body))
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	testFixture.readStage(first)
	secondID := strconv.FormatInt(testFixture.loadMe(second).ID, 10)
	invite := `{"key":"hop","partner_ids":[` + secondID + `]}`
	response := testFixture.callAPI("POST", "/v1/partner-emotes", first, invite)
	requireProblem(t, response, http.StatusConflict, "too_far")

	// The planner stops at a free spot beside the other jelly, and half a minute is plenty to walk.
	testFixture.advanceClock(time.Second)
	point := findPointOf(t, testFixture.readStage(first), secondID)
	testFixture.callAPI("POST", "/v1/trips/goto", first,
		`{"x":`+strconv.FormatFloat(point.X, 'f', 2, 64)+
			`,"y":`+strconv.FormatFloat(point.Y, 'f', 2, 64)+`}`)
	testFixture.advanceClock(time.Second)
	testFixture.readStage(first)
	testFixture.advanceClock(30 * time.Second)
	response = testFixture.callAPI("POST", "/v1/partner-emotes", first, invite)
	if response.status != http.StatusOK {
		t.Fatalf("invite: %d %s", response.status, response.body)
	}
}

// findPointOf returns where the current move of a jelly ends.
func findPointOf(t *testing.T, answer api.StageAnswer, playerID string) movement.Point {
	t.Helper()
	for _, move := range answer.Moves {
		if strconv.FormatInt(move.PlayerID, 10) == playerID {
			return move.Points[len(move.Points)-1].Point
		}
	}
	t.Fatalf("jelly %s has no move", playerID)
	return movement.Point{}
}
