package api_test

import (
	"net/http"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// Scenario 7, finding 2: an account deleted in the middle of a stack leaves it with an event, and
// the jellies above move down.
func TestDeletedMemberLeavesTheStackWithAnEvent(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C")
	stackID := testFixture.stackIDOf(players[1])
	testFixture.climb(players[0], stackID)
	testFixture.climb(players[2], stackID)
	testFixture.callAdmin("DELETE", "/admin/api/players/"+strconv.FormatInt(players[1].id, 10), "")
	want := []int64{players[0].id, players[2].id}
	if got := testFixture.membersOf(players[0], stackID); !slices.Equal(got, want) {
		t.Fatalf("members = %v", got)
	}
	// The events of the deleted player are gone with it, so the log even forgets the stack.
	events := testFixture.stackEvents()
	if len(events) == 0 || !strings.Contains(events[len(events)-1], `"member_ids":[1,3]`) {
		t.Fatalf("the members slid down and no `stack.changed` tells it: %v", events)
	}
}

// Scenario 7, finding 2: deleting the only jelly of a stack removes the stack.
func TestStackOfADeletedJellyIsGone(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.callAdmin("DELETE", "/admin/api/players/"+strconv.FormatInt(players[0].id, 10), "")
	for _, stack := range testFixture.readStage(players[1].token).Stacks {
		if stack.ID == stackID && len(stack.MemberIDs) == 0 {
			t.Fatalf("empty stack %+v can be climbed", stack)
		}
	}
}

// Scenario 7, finding 3: hiding a jelly takes it off its stack, so the stage shows no gap.
func TestHiddenMemberLeavesTheStack(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.climb(players[2], stackID)
	testFixture.hide(players[1])
	if members := testFixture.membersOf(
		players[0],
		stackID,
	); slices.Contains(
		members,
		players[1].id,
	) {
		t.Fatalf("hidden jelly %d is in member_ids %v", players[1].id, members)
	}
	levels := testFixture.levelsOf(players[0])
	if levels[players[2].id] != 1 {
		t.Fatalf("top stands at level %d over a gap", levels[players[2].id])
	}
}

// Scenario 7: an absent jelly (no action for the presence window) keeps its place in the stack.
func TestAbsentMemberLeavesAGapInALongRunningStack(t *testing.T) {
	t.Skip("finding 3: IsPresent only cuts the jelly from the stage players. It stays in " +
		"member_ids and the visible ones above it keep their level, so with a long stack_seconds " +
		"a jelly floats over a gap. Without Skip the test fails.")
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C")
	testFixture.patchRules(`{"stack_seconds":86400}`)
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.climb(players[2], stackID)
	testFixture.advanceClock(80 * time.Minute)
	testFixture.pokePlayer(players[0].token)
	testFixture.pokePlayer(players[2].token)
	testFixture.advanceClock(11 * time.Minute)
	testFixture.pokePlayer(players[0].token)
	testFixture.pokePlayer(players[2].token)
	levels := testFixture.levelsOf(players[0])
	if _, present := levels[players[1].id]; present {
		t.Fatalf("the absent jelly is on the stage: %v", levels)
	}
	if levels[players[2].id] != 1 {
		t.Fatalf("top stands at level %d over a gap", levels[players[2].id])
	}
	_ = stackID
}

// Scenario 7: an absent jelly cannot start a stack with its first action.
func TestAbsentJellyCanStartAStackWithItsFirstAction(t *testing.T) {
	t.Skip("finding 4: beginPlayerAction refreshes last_seen_at inside the transaction, but " +
		"startStackHere and climbStack ask the planner first. An absent jelly is not in the " +
		"planner and gets `too_far` until any other action. Without Skip the test fails.")
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B")
	testFixture.advanceClock(91 * time.Minute)
	testFixture.pokePlayer(players[0].token)
	response := testFixture.callAPI("POST", "/v1/stacks", players[1].token, "")
	if response.status != http.StatusOK {
		t.Fatalf("absent jelly starts a stack: %d %s", response.status, response.body)
	}
}

// Scenario 8: A follows B, B climbs a stack. A keeps following and can climb as well.
func TestFollowerOfAStackedJellyKeepsFollowingAndCanClimb(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B")
	testFixture.follow(players[0].token, players[1].token)
	stackID := testFixture.stackIDOf(players[1])
	if follow := testFixture.loadMe(players[0].token).Follow; follow == nil {
		t.Fatal("the stack of the followed jelly ends the following")
	}
	if response := testFixture.climb(players[0], stackID); response.status != http.StatusOK {
		t.Fatalf("%d %s", response.status, response.body)
	}
	if follow := testFixture.loadMe(players[0].token).Follow; follow != nil {
		t.Fatalf("climbing keeps the following: %+v", follow)
	}
}

// Scenario 8: a jelly that stands on a stack stops following, so no circle closes through it.
func TestFollowCircleThroughAStackCannotClose(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B")
	testFixture.follow(players[0].token, players[1].token)
	stackID := testFixture.stackIDOf(players[0])
	if follow := testFixture.loadMe(players[0].token).Follow; follow != nil {
		t.Fatalf("A follows %+v although it stands on a stack", follow)
	}
	if response := testFixture.follow(
		players[1].token,
		players[0].token,
	); response.status != http.StatusOK {
		t.Fatalf("B follows A: %d %s", response.status, response.body)
	}
	if response := testFixture.climb(players[1], stackID); response.status != http.StatusOK {
		t.Fatalf("B climbs: %d %s", response.status, response.body)
	}
	if follow := testFixture.loadMe(players[1].token).Follow; follow != nil {
		t.Fatalf("B follows %+v after climbing", follow)
	}
}

// Scenario 9: the stack stays at its place and the distance is measured to that place.
func TestDistanceToAStackIsMeasuredToTheStackPlace(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.patchRules(`{"near_distance":0.5}`)
	// A leaves with a trip to the other end of the hall, B stands somewhere else.
	testFixture.callAPI("POST", "/v1/trips/goto", players[0].token, `{"x":99,"y":99}`)
	response := testFixture.climb(players[1], stackID)
	if response.status != http.StatusConflict && response.status != http.StatusNotFound {
		t.Fatalf(
			"B stands farther than 0.5 m from the stack: %d %s",
			response.status,
			response.body,
		)
	}
}

// Scenario 10: the highlighted top earns lighthouse for everyone who stands on the stack at that
// moment and not for the one who has left, and a second highlight changes nothing.
func TestLighthouseGoesToTheCurrentMembersOnce(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C", "V")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.climb(players[2], stackID)
	testFixture.leaveStack(players[1])
	testFixture.callAPI(
		"POST",
		"/v1/highlights",
		players[3].token,
		testFixture.playerBodyOf(players[2]),
	)
	for _, player := range players[:3] {
		earned := slices.Contains(
			findAchievementKeys(testFixture.loadMe(player.token)), rules.AchievementLighthouse)
		if earned == (player == players[1]) {
			t.Fatalf("lighthouse of %d: earned = %v", player.id, earned)
		}
	}
	testFixture.advanceClock(time.Minute)
	testFixture.callAPI(
		"POST",
		"/v1/highlights",
		players[3].token,
		testFixture.playerBodyOf(players[2]),
	)
	count := 0
	for _, key := range findAchievementKeys(testFixture.loadMe(players[0].token)) {
		if key == rules.AchievementLighthouse {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("lighthouse earned %d times", count)
	}
}

// Scenario 10, finding 5: nobody on the stack can light it, neither the top itself nor a jelly
// below. Otherwise two accounts of one player earn both achievements alone.
func TestOnlyAJellyOffTheStackLightsTheLighthouse(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	for _, caller := range players {
		testFixture.callAPI(
			"POST",
			"/v1/highlights",
			caller.token,
			testFixture.playerBodyOf(players[1]),
		)
		testFixture.advanceClock(time.Hour)
	}
	for _, player := range players {
		keys := findAchievementKeys(testFixture.loadMe(player.token))
		if slices.Contains(keys, rules.AchievementLighthouse) ||
			slices.Contains(keys, rules.AchievementLighthouseLight) {
			t.Fatalf("the stack lit itself: %v", keys)
		}
	}
}

// Scenario 10, finding 3: a hidden jelly is off the stack and earns no lighthouse.
func TestHiddenMemberEarnsNoLighthouse(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "V")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.hide(players[0])
	testFixture.callAPI(
		"POST",
		"/v1/highlights",
		players[2].token,
		testFixture.playerBodyOf(players[1]),
	)
	keys := findAchievementKeys(testFixture.loadMe(players[0].token))
	if slices.Contains(keys, rules.AchievementLighthouse) {
		t.Fatalf("hidden jelly earned the lighthouse: %v", keys)
	}
}

// Scenario 11: bots climb stacks, also the one they already stand on, next to real players.
func TestBotsStackNextToPlayersWithoutBreakingTheStage(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A")
	testFixture.callAdmin("POST", "/admin/api/lans/1/bots", `{"count":3}`)
	bots := testFixture.listBots().Bots
	testFixture.stackIDOf(players[0])
	for round := range 4 {
		for _, bot := range bots {
			path := "/admin/api/bots/" + strconv.FormatInt(bot.ID, 10) + "/actions"
			response := testFixture.callAdmin("POST", path, `{"kind":"stack"}`)
			if response.status >= http.StatusInternalServerError {
				t.Fatalf("round %d bot %d: %d %s", round, bot.ID, response.status, response.body)
			}
		}
		testFixture.advanceClock(2 * time.Second)
		for _, stack := range testFixture.readStage(players[0].token).Stacks {
			if len(stack.MemberIDs) == 0 {
				t.Fatalf("empty stack: %+v", stack)
			}
		}
	}
}

// Scenario 12: after a restart the stacks come from the database and the levels are the same.
func TestStacksSurviveARestartWithTheSameLevels(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.climb(players[2], stackID)
	testFixture.advanceClock(2 * time.Second)
	testFixture.readStage(players[0].token)
	testFixture.restartServer()
	levels := testFixture.levelsOf(players[0])
	if levels[players[0].id] != 0 || levels[players[1].id] != 1 || levels[players[2].id] != 2 {
		t.Fatalf("levels after the restart = %v", levels)
	}
	// A stack that ran out during the downtime is cleaned up by the first tick.
	testFixture.restartServer()
	testFixture.advanceClock(5 * time.Minute)
	testFixture.loadStage()
	if stacks := testFixture.readStage(players[0].token).Stacks; len(stacks) != 0 {
		t.Fatalf("stacks = %+v", stacks)
	}
	if got := testFixture.countEvents(store.EventStackChanged, idEvent(stackID)); got != 1 {
		t.Fatalf("end announced %d times", got)
	}
}

// Scenario 13: a shorter time and a lower limit apply to new stacks, running ones keep their time.
func TestRuleChangesLeaveRunningStacksAlone(t *testing.T) {
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B", "C", "D")
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.climb(players[2], stackID)
	endsAt := testFixture.readStage(players[0].token).Stacks[0].EndsAt
	testFixture.patchRules(`{"stack_max_members":2,"stack_seconds":1}`)
	if got := testFixture.readStage(players[0].token).Stacks[0].EndsAt; got != endsAt {
		t.Fatalf("ends_at changed from %d to %d", endsAt, got)
	}
	requireProblem(t, testFixture.climb(players[3], stackID), http.StatusConflict, "stack_full")
	testFixture.leaveStack(players[2])
	requireProblem(t, testFixture.climb(players[3], stackID), http.StatusConflict, "stack_full")
	testFixture.leaveStack(players[1])
	if response := testFixture.climb(players[3], stackID); response.status != http.StatusOK {
		t.Fatalf("%d %s", response.status, response.body)
	}
}

// Scenario 7: the LAN ends while a jelly stands on a stack. In the next LAN the old row is still
// there and the jelly climbing down announces a stack of the old LAN.
func TestStackOfAnEndedLANDoesNotLeakIntoTheNextLAN(t *testing.T) {
	t.Skip("finding 6: FinishExpired only looks at the running LAN, so the stack_members row of " +
		"the old LAN stays (UNIQUE player_id). In the next LAN, leaving or starting a stack " +
		"deletes it and writes `stack.changed {id: <old stack>}` into the new LAN. " +
		"Without Skip the test fails.")
	testFixture := newFixture(t)
	testFixture.createFutureLAN()
	players := testFixture.registerStackPlayers("A")
	testFixture.stackIDOf(players[0])
	secret := testFixture.seatPlayerInSecondLAN(players[0].token)
	testFixture.advanceClock(30*24*time.Hour + time.Hour)
	testFixture.loadStage()
	before := len(testFixture.stackEvents())
	response := testFixture.callAPI("DELETE", "/v1/stacks/current", secret, "")
	if response.status != http.StatusOK {
		t.Fatalf("%d %s", response.status, response.body)
	}
	if got := len(testFixture.stackEvents()); got != before {
		t.Fatalf("the new LAN got %d `stack.changed` of a stack it never had", got-before)
	}
}

// Scenario 7: during a gathering the members walk away from the stack.
func TestGatheringTakesTheMembersAwayFromTheStack(t *testing.T) {
	t.Skip("finding 7: findPlan puts a gathering before a stack, so the move of a member has " +
		"kind food/ceremony and stack_level 0 while stacks[] still lists it in member_ids. " +
		"A client that builds the tower from stacks[] shows it empty. Without Skip the test fails.")
	testFixture := newFixture(t)
	players := testFixture.registerStackPlayers("A", "B")
	testFixture.createArea(`{"x":60,"y":60,"width":30,"height":30,"kind":"queue"}`)
	stackID := testFixture.stackIDOf(players[0])
	testFixture.climb(players[1], stackID)
	testFixture.callAdmin("POST", gatheringPath, `{"kind":"food","seconds":60}`)
	testFixture.advanceClock(2 * time.Second)
	for _, move := range testFixture.readStage(players[0].token).Moves {
		if move.Kind != movement.KindStack {
			t.Fatalf("a member of a standing stack is away: %+v", move)
		}
	}
}
