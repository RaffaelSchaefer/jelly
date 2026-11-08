package rules_test

import (
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

func TestEveryRollPicksABotActionByItsWeight(t *testing.T) {
	counts := map[string]int{}
	for roll := range rules.CountBotChoices() {
		counts[rules.ChooseBotAction(roll)]++
	}
	want := map[string]int{
		"emote": 30, "sign": 15, "poke": 20, "food": 5, "drink": 5, "trip": 15, "follow": 10,
		"stack": 5,
	}
	for action, weight := range want {
		if counts[action] != weight {
			t.Errorf("%s: %d rolls, want %d", action, counts[action], weight)
		}
	}
	if counts["xp"] != 0 {
		t.Error("automatic bots must not give themselves XP")
	}
}
