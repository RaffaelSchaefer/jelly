package api_test

import (
	"encoding/json"
	"net/http"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// startStack starts a stack and returns its ID as text.
func (testFixture *fixture) startStack(token string) string {
	testFixture.t.Helper()
	response := testFixture.callAPI("POST", "/v1/stacks", token, "")
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("stack: %d %s", response.status, response.body)
	}
	return strconv.FormatInt(decodeBody[store.StackAnswer](testFixture.t, response).Stack.ID, 10)
}

// joinStack climbs on a stack and returns the answer.
func (testFixture *fixture) joinStack(token, stackID string) apiResponse {
	testFixture.t.Helper()
	return testFixture.callAPI("POST", "/v1/stacks/members", token, `{"stack_id":`+stackID+`}`)
}

func TestStackGrowsAndShowsOnTheStage(t *testing.T) {
	testFixture := newFixture(t)
	bottom := testFixture.registerPlayer("A")
	top := testFixture.registerPlayer("B")
	stackID := testFixture.startStack(bottom)
	response := testFixture.joinStack(top, stackID)
	if response.status != http.StatusOK {
		t.Fatalf("join: %d %s", response.status, response.body)
	}
	bottomID, topID := testFixture.loadMe(bottom).ID, testFixture.loadMe(top).ID
	stack := decodeBody[store.StackAnswer](t, response).Stack
	if !slices.Equal(stack.MemberIDs, []int64{bottomID, topID}) {
		t.Fatalf("members = %v", stack.MemberIDs)
	}
	testFixture.advanceClock(time.Second)
	answer := testFixture.readStage(top)
	if len(answer.Stacks) != 1 {
		t.Fatalf("stacks = %+v", answer.Stacks)
	}
	for _, move := range answer.Moves {
		wantLevel := 0
		if move.PlayerID == topID {
			wantLevel = 1
		}
		if move.Kind != movement.KindStack || move.StackLevel != wantLevel {
			t.Fatalf("move = %+v", move)
		}
	}
}

func TestStackFallsApartAfterItsTime(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	other := testFixture.registerPlayer("B")
	stackID := testFixture.startStack(token)
	testFixture.advanceClock(2 * time.Minute)
	requireProblem(t, testFixture.joinStack(other, stackID),
		http.StatusNotFound, "stack_not_found")
	answer := testFixture.readStage(token)
	if len(answer.Stacks) != 0 {
		t.Fatalf("stacks = %+v", answer.Stacks)
	}
}

func TestLeavingRemovesTheEmptyStack(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.startStack(token)
	response := testFixture.callAPI("DELETE", "/v1/stacks/current", token, "")
	if response.status != http.StatusOK {
		t.Fatalf("leave: %d %s", response.status, response.body)
	}
	if stacks := testFixture.readStage(token).Stacks; len(stacks) != 0 {
		t.Fatalf("stacks = %+v", stacks)
	}
}

func TestStartingATripLeavesTheStack(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.startStack(token)
	testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":40,"y":60}`)
	if stacks := testFixture.readStage(token).Stacks; len(stacks) != 0 {
		t.Fatalf("stacks = %+v", stacks)
	}
}

func TestStackHasNoLimitUnlessTheAdminSetsOne(t *testing.T) {
	testFixture := newFixture(t)
	stackID := testFixture.startStack(testFixture.registerPlayer("Z"))
	for member := range 10 {
		response := testFixture.joinStack(
			testFixture.registerPlayer("A"+strconv.Itoa(member)),
			stackID,
		)
		if response.status != http.StatusOK {
			t.Fatalf("join: %d %s", response.status, response.body)
		}
	}
	gameRules := rules.DefaultRules()
	gameRules.NearDistance = 1000
	gameRules.StackMaxMembers = 11
	body, err := json.Marshal(gameRules)
	if err != nil {
		t.Fatal(err)
	}
	testFixture.callAdmin("PUT", "/admin/api/lans/1/rules", string(body))
	requireProblem(t, testFixture.joinStack(testFixture.registerPlayer("Late"), stackID),
		http.StatusConflict, "stack_full")
}

func TestHighlightLightsUpAndWaitsForTheCooldown(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	target := testFixture.registerPlayer("B")
	body := testFixture.playerBody(target)
	response := testFixture.callAPI("POST", "/v1/highlights", token, body)
	if response.status != http.StatusOK {
		t.Fatalf("highlight: %d %s", response.status, response.body)
	}
	requireProblem(t, testFixture.callAPI("POST", "/v1/highlights", token, body),
		http.StatusConflict, "highlight_cooldown")
	testFixture.advanceClock(30 * time.Second)
	response = testFixture.callAPI("POST", "/v1/highlights", token, `{"player_id":99}`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_highlight")
}

func TestHighlightingTheTopOfAStackMakesALighthouse(t *testing.T) {
	testFixture := newFixture(t)
	bottom := testFixture.registerPlayer("A")
	top := testFixture.registerPlayer("B")
	viewer := testFixture.registerPlayer("C")
	testFixture.joinStack(top, testFixture.startStack(bottom))

	testFixture.callAPI("POST", "/v1/highlights", viewer, testFixture.playerBody(bottom))
	if slices.Contains(findAchievementKeys(testFixture.loadMe(top)), rules.AchievementLighthouse) {
		t.Fatal("the bottom jelly is no light")
	}
	testFixture.advanceClock(30 * time.Second)
	testFixture.callAPI("POST", "/v1/highlights", viewer, testFixture.playerBody(top))
	bottomKeys := findAchievementKeys(testFixture.loadMe(bottom))
	topKeys := findAchievementKeys(testFixture.loadMe(top))
	if !slices.Contains(bottomKeys, rules.AchievementLighthouse) ||
		slices.Contains(bottomKeys, rules.AchievementLighthouseLight) {
		t.Fatalf("bottom = %v", bottomKeys)
	}
	if !slices.Contains(topKeys, rules.AchievementLighthouseLight) {
		t.Fatalf("top = %v", topKeys)
	}
}
