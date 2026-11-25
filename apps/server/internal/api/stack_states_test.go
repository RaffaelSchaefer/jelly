package api_test

// Plays through states of stacks that the other tests do not reach. A test that starts with
// t.Skip("finding N: ...") shows a flaw of the server: remove the Skip to see it fail.

import (
	"net/http"
	"slices"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// stackPlayer is a registered player of a stack test.
type stackPlayer struct {
	token string
	id    int64
}

// registerStackPlayers registers one player per name.
func (testFixture *fixture) registerStackPlayers(names ...string) []stackPlayer {
	testFixture.t.Helper()
	players := make([]stackPlayer, 0, len(names))
	for _, name := range names {
		token := testFixture.registerPlayer(name)
		players = append(players, stackPlayer{token: token, id: testFixture.loadMe(token).ID})
	}
	return players
}

// stackIDOf starts a stack for the player and returns its number.
func (testFixture *fixture) stackIDOf(player stackPlayer) int64 {
	testFixture.t.Helper()
	stackID, err := strconv.ParseInt(testFixture.startStack(player.token), 10, 64)
	if err != nil {
		testFixture.t.Fatal(err)
	}
	return stackID
}

// climb lets a player climb a stack.
func (testFixture *fixture) climb(player stackPlayer, stackID int64) apiResponse {
	testFixture.t.Helper()
	return testFixture.joinStack(player.token, strconv.FormatInt(stackID, 10))
}

// leaveStack lets a player climb down.
func (testFixture *fixture) leaveStack(player stackPlayer) apiResponse {
	testFixture.t.Helper()
	return testFixture.callAPI("DELETE", "/v1/stacks/current", player.token, "")
}

// stackEvents returns the payloads of all `stack.changed` events.
func (testFixture *fixture) stackEvents() []string {
	testFixture.t.Helper()
	events, err := testFixture.database.ListEventsAfter(testFixture.t.Context(), 0)
	if err != nil {
		testFixture.t.Fatal(err)
	}
	payloads := []string{}
	for _, event := range events {
		if event.Type == store.EventStackChanged {
			payloads = append(payloads, string(event.Payload))
		}
	}
	return payloads
}

// levelsOf reads the stack levels on the stage, two seconds later so that the planner has run.
func (testFixture *fixture) levelsOf(viewer stackPlayer) map[int64]int {
	testFixture.t.Helper()
	testFixture.advanceClock(2 * time.Second)
	levels := map[int64]int{}
	for _, move := range testFixture.readStage(viewer.token).Moves {
		if move.Kind == movement.KindStack {
			levels[move.PlayerID] = move.StackLevel
		}
	}
	return levels
}

// membersOf returns the members of the stack with this number from the stage, or nil.
func (testFixture *fixture) membersOf(viewer stackPlayer, stackID int64) []int64 {
	testFixture.t.Helper()
	for _, stack := range testFixture.readStage(viewer.token).Stacks {
		if stack.ID == stackID {
			return stack.MemberIDs
		}
	}
	return nil
}

// patchRules changes single rules of the first LAN.
func (testFixture *fixture) patchRules(body string) {
	testFixture.t.Helper()
	response := testFixture.callAdmin("PATCH", "/admin/api/lans/1/rules", body)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("patch rules: %d %s", response.status, response.body)
	}
}

// playerBodyOf names a jelly by its ID.
func (*fixture) playerBodyOf(player stackPlayer) string {
	return `{"player_id":` + strconv.FormatInt(player.id, 10) + `}`
}

// idEvent is the payload of a `stack.changed` that names only the stack.
func idEvent(stackID int64) string {
	return `{"id":` + strconv.FormatInt(stackID, 10) + `}`
}

// hide hides a player with the admin.
func (testFixture *fixture) hide(player stackPlayer) {
	testFixture.t.Helper()
	testFixture.callAdmin(
		"POST",
		"/admin/api/players/"+strconv.FormatInt(player.id, 10)+"/hide",
		"",
	)
}

// Scenario 1, finding 0: climbing the stack you already top, here alone on it, changes nothing.
// Before the fix, leaving first deleted the stack and the answer was 500.
func TestClimbingTheStackYouTopChangesNothing(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B")
	stackID := testFixture.stackIDOf(players[0])
	before := len(testFixture.stackEvents())
	response := testFixture.climb(players[0], stackID)
	if response.status != http.StatusOK {
		t.Fatalf("climbing your own stack: %d %s", response.status, response.body)
	}
	if testFixture.membersOf(players[0], stackID) == nil ||
		len(testFixture.stackEvents()) != before {
		t.Fatalf("climbing the stack you top must change nothing: %v", testFixture.stackEvents())
	}
	// Whatever the answer is, no empty stack stands afterwards.
	stacks := testFixture.readStage(players[1].token).Stacks
	for _, stack := range stacks {
		if len(stack.MemberIDs) == 0 {
			t.Fatalf("empty stack stands: %+v", stacks)
		}
	}
	t.Logf("status %d, stacks %+v", response.status, stacks)
}

// Scenario 1: starting twice leaves the first stack and removes it when empty.
func TestStartingTwoStacksLeavesNoEmptyStack(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A")
	first := testFixture.stackIDOf(players[0])
	second := testFixture.stackIDOf(players[0])
	stacks := testFixture.readStage(players[0].token).Stacks
	if first == second || len(stacks) != 1 || stacks[0].ID != second {
		t.Fatalf("stacks = %+v", stacks)
	}
	if !slices.Contains(testFixture.stackEvents(), idEvent(first)) {
		t.Fatalf("removal of the first stack is not announced: %v", testFixture.stackEvents())
	}
}

// Scenario 1: a player in the middle climbs the stack again and ends on top.
func TestClimbingYourOwnStackMovesYouToTheTop(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.climb(players[2], stackID)
	response := testFixture.climb(players[1], stackID)
	if response.status != http.StatusOK {
		t.Fatalf("%d %s", response.status, response.body)
	}
	want := []int64{players[0].id, players[2].id, players[1].id}
	if got := testFixture.membersOf(players[0], stackID); !slices.Equal(got, want) {
		t.Fatalf("members = %v, want %v", got, want)
	}
	levels := testFixture.levelsOf(players[0])
	if levels[players[0].id] != 0 || levels[players[2].id] != 1 || levels[players[1].id] != 2 {
		t.Fatalf("levels = %v", levels)
	}
}

// Scenario 2: the player in the middle climbs down and the ones above slide down.
func TestMiddleJellyLeavesAndTheOthersSlideDown(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C", "D")
	stackID := testFixture.stackIDOf(players[0])
	for _, player := range players[1:] {
		testFixture.climb(player, stackID)
	}
	testFixture.leaveStack(players[1])
	want := []int64{players[0].id, players[2].id, players[3].id}
	if got := testFixture.membersOf(players[0], stackID); !slices.Equal(got, want) {
		t.Fatalf("members = %v, want %v", got, want)
	}
	levels := testFixture.levelsOf(players[0])
	if len(levels) != 3 || levels[players[0].id] != 0 || levels[players[2].id] != 1 ||
		levels[players[3].id] != 2 {
		t.Fatalf("levels = %v", levels)
	}
}

// Scenario 2 and 4, finding 1: after a jelly in the middle left, the event carries the whole
// stack. Only a stack that is gone is announced by its ID alone.
func TestLeavingAStandingStackAnnouncesItWhole(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.climb(players[2], stackID)
	before := len(testFixture.stackEvents())
	testFixture.leaveStack(players[1])
	events := testFixture.stackEvents()[before:]
	if len(events) != 1 {
		t.Fatalf("events = %v", events)
	}
	if testFixture.membersOf(players[0], stackID) == nil {
		t.Fatal("the stack must still stand")
	}
	if events[0] == idEvent(stackID) {
		t.Fatalf("the stack stands with 2 members, but the event says only %s", events[0])
	}
}

// Scenario 3: the bottom jelly goes on a trip. The stack stays where it was started.
func TestBottomJellyLeavesOnATripAndTheStackStays(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.climb(players[2], stackID)
	start := testFixture.readStage(players[0].token).Stacks[0]
	testFixture.callAPI("POST", "/v1/trips/goto", players[0].token, `{"x":40,"y":60}`)
	after := testFixture.readStage(players[0].token).Stacks[0]
	want := []int64{players[1].id, players[2].id}
	if !slices.Equal(after.MemberIDs, want) || after.X != start.X || after.Y != start.Y ||
		after.EndsAt != start.EndsAt {
		t.Fatalf("before %+v, after %+v", start, after)
	}
	levels := testFixture.levelsOf(players[0])
	if levels[players[1].id] != 0 || levels[players[2].id] != 1 {
		t.Fatalf("levels = %v", levels)
	}
}

// Scenario 3: following someone also takes the jelly off the stack.
func TestFollowingLeavesTheStackAndThoseAboveSlideDown(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.climb(players[2], stackID)
	testFixture.follow(players[1].token, players[0].token)
	want := []int64{players[0].id, players[2].id}
	if got := testFixture.membersOf(players[0], stackID); !slices.Equal(got, want) {
		t.Fatalf("members = %v, want %v", got, want)
	}
}

// Scenario 4: the last jelly climbs down, the stack is gone and announced with the ID only.
func TestLastJellyLeavesAndTheStackIsAnnouncedGone(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.leaveStack(players[1])
	testFixture.leaveStack(players[0])
	if stacks := testFixture.readStage(players[0].token).Stacks; len(stacks) != 0 {
		t.Fatalf("stacks = %+v", stacks)
	}
	events := testFixture.stackEvents()
	if events[len(events)-1] != idEvent(stackID) {
		t.Fatalf("events = %v", events)
	}
	requireProblem(
		t,
		testFixture.climb(players[1], stackID),
		http.StatusNotFound,
		"stack_not_found",
	)
	// Leaving without a stack changes nothing and announces nothing.
	count := len(testFixture.stackEvents())
	testFixture.leaveStack(players[0])
	if got := len(testFixture.stackEvents()); got != count {
		t.Fatalf("leaving without a stack announced %d events", got-count)
	}
}

// Scenario 5: the stack is running one millisecond before `ends_at` and gone at `ends_at`.
func TestStackEndsExactlyAtItsEndsAt(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C")
	stackID := testFixture.stackIDOf(players[0])
	endsAt := testFixture.readStage(players[0].token).Stacks[0].EndsAt
	testFixture.clock.Store(endsAt - 1)
	if response := testFixture.climb(players[1], stackID); response.status != http.StatusOK {
		t.Fatalf("1 ms before the end: %d %s", response.status, response.body)
	}
	testFixture.clock.Store(endsAt)
	requireProblem(
		t,
		testFixture.climb(players[2], stackID),
		http.StatusNotFound,
		"stack_not_found",
	)
	if stacks := testFixture.loadStage().Stacks; len(stacks) != 0 {
		t.Fatalf("stack stands at ends_at: %+v", stacks)
	}
	// The rows are cleaned up by the next tick, not by the request.
	testFixture.advanceClock(2 * time.Second)
	testFixture.loadStage()
	if got := testFixture.countEvents(store.EventStackChanged, idEvent(stackID)); got != 1 {
		t.Fatalf("end announced %d times", got)
	}
	if response := testFixture.leaveStack(players[1]); response.status != http.StatusOK {
		t.Fatalf("leaving after the end: %d %s", response.status, response.body)
	}
}

// Scenario 5: a stack that has run out, but is not cleaned up yet, makes no lighthouse and its
// members can still start a new stack.
func TestExpiredStackBeforeTheTickEarnsNothingAndReleasesItsMembers(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	endsAt := testFixture.readStage(players[0].token).Stacks[0].EndsAt
	testFixture.clock.Store(endsAt)
	testFixture.callAPI(
		"POST",
		"/v1/highlights",
		players[2].token,
		testFixture.playerBodyOf(players[1]),
	)
	for _, player := range players[:2] {
		keys := findAchievementKeys(testFixture.loadMe(player.token))
		if slices.Contains(keys, rules.AchievementLighthouse) {
			t.Fatalf("lighthouse of an expired stack: %v", keys)
		}
	}
	response := testFixture.callAPI("POST", "/v1/stacks", players[1].token, "")
	if response.status != http.StatusOK {
		t.Fatalf("new stack: %d %s", response.status, response.body)
	}
}

// Scenario 6: two players climb at the same time and only one fits.
func TestTwoJelliesRaceForTheLastPlace(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C", "D")
	testFixture.patchRules(`{"stack_max_members":3}`)
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	var group sync.WaitGroup
	answers := make([]apiResponse, 2)
	for index, player := range players[2:] {
		group.Go(func() {
			answers[index] = testFixture.climb(player, stackID)
		})
	}
	group.Wait()
	climbed, full := 0, 0
	for _, response := range answers {
		switch response.status {
		case http.StatusOK:
			climbed++
		case http.StatusConflict:
			full++
		}
	}
	if climbed != 1 || full != 1 {
		t.Fatalf("answers = %d %s, %d %s", answers[0].status, answers[0].body,
			answers[1].status, answers[1].body)
	}
	if got := len(testFixture.membersOf(players[0], stackID)); got != 3 {
		t.Fatalf("members = %d", got)
	}
}

// Scenario 6: a member of a full stack who climbs it again is refused with `stack_full`.
func TestMemberOfAFullStackCannotClimbItAgain(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B")
	testFixture.patchRules(`{"stack_max_members":2}`)
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	requireProblem(t, testFixture.climb(players[0], stackID), http.StatusConflict, "stack_full")
	if got := testFixture.membersOf(players[0], stackID); len(got) != 2 {
		t.Fatalf("members = %v", got)
	}
}
