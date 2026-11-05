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
	if state.Trip == nil || state.Trip.X != 40 || state.Trip.EndsAt != want {
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

func TestFollowingEndsAfterItsTimeAndTheJellyWalksBack(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	target := testFixture.registerPlayer("B")
	testFixture.readStage(token)
	testFixture.advanceClock(time.Second)
	state := decodeBody[store.PlayerState](t, testFixture.follow(token, target))
	want := testFixture.clock.Load() + (30 * time.Minute).Milliseconds()
	if state.Follow == nil || state.Follow.EndsAt != want {
		t.Fatalf("follow = %+v, want %d", state.Follow, want)
	}
	testFixture.advanceClock(time.Second)
	playerID := state.ID
	if kind := findMoveOf(
		t,
		testFixture.readStage(token),
		playerID,
	).Kind; kind != movement.KindFollow {
		t.Fatalf("kind = %s", kind)
	}
	testFixture.advanceClock(30 * time.Minute)
	testFixture.pokePlayer(token)
	testFixture.pokePlayer(target)
	answer := testFixture.readStage(token)
	if kind := findMoveOf(t, answer, playerID).Kind; kind != movement.KindWander {
		t.Fatalf("after the time, kind = %s", kind)
	}
	if me := testFixture.loadMe(token); me.Follow != nil {
		t.Fatalf("follow = %+v", me.Follow)
	}
}

func TestFollowingSomeoneElseStartsANewTime(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.follow(token, testFixture.registerPlayer("B"))
	testFixture.advanceClock(time.Minute)
	state := decodeBody[store.PlayerState](
		t,
		testFixture.follow(token, testFixture.registerPlayer("C")),
	)
	want := testFixture.clock.Load() + (30 * time.Minute).Milliseconds()
	if state.Follow == nil || state.Follow.EndsAt != want {
		t.Fatalf("follow = %+v, want %d", state.Follow, want)
	}
}

func TestFollowingTheSameJellyAgainKeepsTheTime(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	target := testFixture.registerPlayer("B")
	first := decodeBody[store.PlayerState](t, testFixture.follow(token, target))
	testFixture.advanceClock(time.Minute)
	second := decodeBody[store.PlayerState](t, testFixture.follow(token, target))
	if first.Follow.EndsAt != second.Follow.EndsAt {
		t.Fatalf("the end moved from %d to %d", first.Follow.EndsAt, second.Follow.EndsAt)
	}
}

func TestAnExpiredFollowIsNoCircle(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	testFixture.follow(first, second)
	testFixture.advanceClock(30 * time.Minute)
	if response := testFixture.follow(second, first); response.status != http.StatusOK {
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
	if state := decodeBody[store.PlayerState](t, response); state.Follow != nil {
		t.Fatalf("still follows %+v", state.Follow)
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

// findMoveOf returns the current move of a jelly.
func findMoveOf(t *testing.T, answer api.StageAnswer, playerID int64) movement.Move {
	t.Helper()
	for _, move := range answer.Moves {
		if move.PlayerID == playerID {
			return move
		}
	}
	t.Fatalf("jelly %d has no move", playerID)
	return movement.Move{}
}

// findPointOf returns where the current move of a jelly ends.
func findPointOf(t *testing.T, answer api.StageAnswer, playerID string) movement.Point {
	t.Helper()
	number, err := strconv.ParseInt(playerID, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	move := findMoveOf(t, answer, number)
	return move.Points[len(move.Points)-1].Point
}

func TestAcceptingNeedsToStillStandNearby(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	inviteID := testFixture.invitePartner(first, second)
	testFixture.advanceClock(time.Second)
	gameRules := rules.DefaultRules()
	gameRules.NearDistance = 0.1
	body, err := json.Marshal(gameRules)
	if err != nil {
		t.Fatal(err)
	}
	testFixture.callAdmin("PUT", "/admin/api/lans/1/rules", string(body))
	requireProblem(t, testFixture.answerInvite(second, inviteID, "accepted"),
		http.StatusConflict, "too_far")
	response := testFixture.answerInvite(second, inviteID, "declined")
	if response.status != http.StatusOK {
		t.Fatalf("a refused answer leaves the invite open: %d %s", response.status, response.body)
	}
}
