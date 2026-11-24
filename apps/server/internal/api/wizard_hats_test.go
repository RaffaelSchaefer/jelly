package api_test

import (
	"encoding/json"
	"net/http"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// stealWizardHat takes the hat of the wizard and returns the answer.
func (testFixture *fixture) stealWizardHat(token string) apiResponse {
	testFixture.t.Helper()
	return testFixture.callAPI("POST", "/v1/wizard-hat", token, "")
}

// requireWizardHat steals the hat and fails if that does not work.
func (testFixture *fixture) requireWizardHat(token string) store.PlayerState {
	testFixture.t.Helper()
	response := testFixture.stealWizardHat(token)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("steal hat: %d %s", response.status, response.body)
	}
	return decodeBody[store.PlayerState](testFixture.t, response)
}

// findStageHead returns the key a jelly wears on its head on the stage.
func findStageHead(t *testing.T, stage stageResponse, playerID int64) string {
	t.Helper()
	for _, player := range stage.Players {
		if player.ID == playerID {
			return player.Equipped[rules.SlotHead].Key
		}
	}
	t.Fatalf("jelly %d is not on the stage", playerID)
	return ""
}

func TestAStolenWizardHatIsWornEverywhere(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Dieb")
	state := testFixture.requireWizardHat(token)
	hat := state.WizardHat
	if hat == nil || hat.HolderID != state.ID || hat.HolderName != "Dieb" {
		t.Fatalf("wizard hat = %+v", hat)
	}
	if want := testFixture.clock.Load() + 300_000; hat.EndsAt != want {
		t.Fatalf("ends at %d, want %d", hat.EndsAt, want)
	}
	head := state.Equipped[rules.SlotHead]
	if head.Key != rules.CosmeticWizardHat || head.Color != nil {
		t.Fatalf("head = %+v", head)
	}
	if got := findStageHead(t, testFixture.loadStage(), state.ID); got != rules.CosmeticWizardHat {
		t.Fatalf("stage head = %q", got)
	}
	profile := testFixture.callAPI("GET", "/v1/players/"+strconv.FormatInt(state.ID, 10), token, "")
	if got := decodeBody[store.PlayerProfile](t, profile).Equipped[rules.SlotHead].Key; got !=
		rules.CosmeticWizardHat {
		t.Fatalf("profile head = %q", got)
	}
	payload := `{"holder_id":` + strconv.FormatInt(state.ID, 10) +
		`,"ends_at":` + strconv.FormatInt(hat.EndsAt, 10) + `,"worn":true}`
	if got := testFixture.countEvents(store.EventWizardHatChanged, payload); got != 1 {
		t.Fatalf("theft announced %d times", got)
	}
	if !slices.Contains(findAchievementKeys(state), rules.AchievementHatThief) {
		t.Fatalf("achievements = %+v", state.Achievements)
	}
}

func TestOnlyOneJellyWearsTheWizardHat(t *testing.T) {
	testFixture := newFixture(t)
	thief := testFixture.registerPlayer("Dieb")
	other := testFixture.registerPlayer("Zweiter")
	first := testFixture.requireWizardHat(thief)
	requireProblem(t, testFixture.stealWizardHat(other), http.StatusConflict, "wizard_hat_taken")
	if hat := testFixture.loadMe(other).WizardHat; hat == nil || hat.HolderID != first.ID {
		t.Fatalf("the other jelly sees %+v", hat)
	}

	testFixture.advanceClock(time.Minute)
	again := testFixture.requireWizardHat(thief)
	if again.WizardHat.EndsAt != first.WizardHat.EndsAt {
		t.Fatalf("taking it again moved the end from %d to %d",
			first.WizardHat.EndsAt, again.WizardHat.EndsAt)
	}
	if got := len(testFixture.listWizardHatChanges()); got != 1 {
		t.Fatalf("hat changes = %d, want only the first theft", got)
	}
}

func TestAnExpiredWizardHatIsFreeBeforeItIsCleared(t *testing.T) {
	testFixture := newFixture(t)
	thief := testFixture.registerPlayer("Dieb")
	other := testFixture.registerPlayer("Zweiter")
	first := testFixture.requireWizardHat(thief)
	// Without reading the stage, nothing clears the old row before the next theft.
	testFixture.advanceClock(time.Duration(first.WizardHat.EndsAt-testFixture.clock.Load()) *
		time.Millisecond)
	second := testFixture.requireWizardHat(other)
	if second.WizardHat == nil || second.WizardHat.HolderID != second.ID {
		t.Fatalf("wizard hat = %+v", second.WizardHat)
	}
	if got := testFixture.loadMe(thief).Equipped[rules.SlotHead].Key; got != "" {
		t.Fatalf("the first thief still wears %q", got)
	}
	if got := testFixture.countWornFalse(); got != 0 {
		t.Fatalf("return announced %d times", got)
	}
}

func TestAWizardHatGoesBackByItself(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Dieb")
	playerID := testFixture.loadMe(token).ID
	path := strconv.FormatInt(playerID, 10)
	testFixture.callAdmin("POST", "/admin/api/players/"+path+"/coins", `{"coins":10}`)
	testFixture.callAPI("POST", "/v1/purchases", token, `{"key":"beanie"}`)
	testFixture.callAPI("POST", "/v1/purchases", token, `{"key":"pixel-glasses"}`)
	testFixture.callAPI("PUT", "/v1/cosmetics/equipped", token, `{"slot":"head","key":"beanie"}`)
	testFixture.callAPI("PUT", "/v1/cosmetics/equipped", token,
		`{"slot":"face","key":"pixel-glasses"}`)
	hat := testFixture.requireWizardHat(token).WizardHat

	// A refund takes off what is locked, but the hat must not count as a locked choice.
	purchases := testFixture.loadAdminPurchases(playerID)
	glasses := slices.IndexFunc(purchases, func(purchase store.PlayerPurchase) bool {
		return purchase.CosmeticKey == "pixel-glasses"
	})
	if glasses < 0 {
		t.Fatalf("purchases = %+v", purchases)
	}
	testFixture.callAdmin("DELETE", "/admin/api/players/"+path+"/purchases/"+
		strconv.FormatInt(purchases[glasses].ID, 10), "")
	duringHat := testFixture.loadMe(token).Equipped[rules.SlotHead].Key
	if duringHat != rules.CosmeticWizardHat {
		t.Fatalf("head during the hat = %q", duringHat)
	}

	testFixture.letTimeRunOut(hat.EndsAt)
	testFixture.advanceClock(time.Second)
	testFixture.loadStage()
	if got := testFixture.countWornFalse(); got != 1 {
		t.Fatalf("return announced %d times", got)
	}
	state := testFixture.loadMe(token)
	if state.WizardHat != nil || state.Equipped[rules.SlotHead].Key != "beanie" {
		t.Fatalf("after the hat: %+v, head %+v", state.WizardHat, state.Equipped)
	}
	if got := findStageHead(t, testFixture.loadStage(), playerID); got != "beanie" {
		t.Fatalf("stage head after the hat = %q", got)
	}
}

// wizardHatChange is the payload of `wizard_hat.changed`.
type wizardHatChange struct {
	HolderID int64 `json:"holder_id"`
	Worn     bool  `json:"worn"`
}

// listWizardHatChanges returns every `wizard_hat.changed` so far.
func (testFixture *fixture) listWizardHatChanges() []wizardHatChange {
	testFixture.t.Helper()
	events, err := testFixture.database.ListEventsAfter(testFixture.t.Context(), 0)
	if err != nil {
		testFixture.t.Fatal(err)
	}
	changes := []wizardHatChange{}
	for _, event := range events {
		if event.Type != store.EventWizardHatChanged {
			continue
		}
		var change wizardHatChange
		err = json.Unmarshal(event.Payload, &change)
		if err != nil {
			testFixture.t.Fatal(err)
		}
		changes = append(changes, change)
	}
	return changes
}

// countWornFalse counts the returns of the hat of the wizard.
func (testFixture *fixture) countWornFalse() int {
	testFixture.t.Helper()
	found := 0
	for _, change := range testFixture.listWizardHatChanges() {
		if !change.Worn {
			found++
		}
	}
	return found
}

func TestTheHatThiefIsGrantedOnce(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Dieb")
	hat := testFixture.requireWizardHat(token).WizardHat
	testFixture.letTimeRunOut(hat.EndsAt)
	state := testFixture.requireWizardHat(token)
	earned := 0
	for _, achievement := range state.Achievements {
		if achievement.Key == rules.AchievementHatThief {
			earned++
		}
	}
	if earned != 1 {
		t.Fatalf("hat-thief earned %d times", earned)
	}
	if got := testFixture.countEvents(store.EventAchievement, `{"key":"hat-thief"}`); got != 1 {
		t.Fatalf("hat-thief announced %d times", got)
	}
}

func TestTheWizardHatCannotBeEquipped(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Dieb")
	testFixture.requireWizardHat(token)
	response := testFixture.callAPI("PUT", "/v1/cosmetics/equipped", token,
		`{"slot":"head","key":"wizard-hat"}`)
	requireProblem(t, response, http.StatusConflict, "cosmetic_locked")
}

func TestAHiddenJellyDoesNotHoldTheWizardHat(t *testing.T) {
	testFixture := newFixture(t)
	thief := testFixture.registerPlayer("Dieb")
	other := testFixture.registerPlayer("Zweiter")
	thiefID := strconv.FormatInt(testFixture.loadMe(thief).ID, 10)
	testFixture.requireWizardHat(thief)
	testFixture.callAdmin("POST", "/admin/api/players/"+thiefID+"/hide", "")
	if hat := testFixture.loadMe(other).WizardHat; hat != nil {
		t.Fatalf("the hat of a hidden jelly shows %+v", hat)
	}
	state := testFixture.requireWizardHat(other)
	if state.WizardHat == nil || state.WizardHat.HolderID != state.ID {
		t.Fatalf("wizard hat = %+v", state.WizardHat)
	}
	hidden := testFixture.requireWizardHat(thief)
	if hidden.WizardHat == nil || hidden.WizardHat.HolderID != state.ID {
		t.Fatalf("a hidden jelly took the hat: %+v", hidden.WizardHat)
	}
}

func TestTheWizardHatNeedsARunningLAN(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Dieb")
	testFixture.advanceClock(30 * 24 * time.Hour)
	response := testFixture.stealWizardHat(token)
	requireProblem(t, response, http.StatusConflict, "no_active_lan")
	if hat := testFixture.loadMe(token).WizardHat; hat != nil {
		t.Fatalf("wizard hat outside a LAN = %+v", hat)
	}
}

func TestTheWizardHatOfAHiddenJellyGoesBackQuietly(t *testing.T) {
	testFixture := newFixture(t)
	thief := testFixture.registerPlayer("Dieb")
	state := testFixture.requireWizardHat(thief)
	testFixture.callAdmin("POST", "/admin/api/players/"+strconv.FormatInt(state.ID, 10)+"/hide", "")
	testFixture.letTimeRunOut(state.WizardHat.EndsAt)
	if got := testFixture.countWornFalse(); got != 0 {
		t.Fatalf("return of a hidden jelly announced %d times", got)
	}
}
