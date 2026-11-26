package rules_test

import (
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// countLevelsByHand walks the curve one level at a time, as a check for the closed form.
func countLevelsByHand(gameRules rules.Rules, earnedXP int) rules.LevelProgress {
	level, start := rules.FirstLevel, 0
	for {
		cost := gameRules.XPPerLevel
		if gameRules.XPCurve == rules.CurveQuadratic {
			cost = min(gameRules.XPPerLevel+gameRules.XPPerLevelStep*(level-1),
				max(gameRules.XPPerLevelMax, gameRules.XPPerLevel))
		}
		if earnedXP < start+cost {
			return rules.LevelProgress{
				Level:          level,
				XPInLevel:      earnedXP - start,
				XPForNextLevel: cost,
			}
		}
		start += cost
		level++
	}
}

func TestLevelProgressMatchesWalkingTheCurve(t *testing.T) {
	curves := []rules.Rules{rules.DefaultRules()}
	curves = append(curves, rules.DefaultRules(), rules.DefaultRules(), rules.DefaultRules())
	curves[1].XPCurve = rules.CurveLinear
	curves[2].XPPerLevelStep = 7
	curves[2].XPPerLevelMax = 101
	curves[3].XPPerLevelStep = 0
	for _, gameRules := range curves {
		for earnedXP := range 8_000 {
			want := countLevelsByHand(gameRules, earnedXP)
			if got := rules.CalculateLevelProgress(gameRules, earnedXP); got != want {
				t.Fatalf(
					"%+v at %d XP: got %+v, want %+v",
					gameRules.PublicRules,
					earnedXP,
					got,
					want,
				)
			}
		}
	}
}

func TestEveryLevelRuleIsLockedOnceTheLANRuns(t *testing.T) {
	stored := rules.DefaultRules()
	if got := rules.FindChangedLevelRule(stored, stored); got != "" {
		t.Fatalf("unchanged rules lock %q", got)
	}
	changed := stored
	changed.TripSeconds++
	if got := rules.FindChangedLevelRule(stored, changed); got != "" {
		t.Fatalf("a rule without levels locks %q", got)
	}
	changed = stored
	changed.XPPerLevelMax++
	if got := rules.FindChangedLevelRule(stored, changed); got != rules.RuleXPPerLevelMax {
		t.Fatalf("changed ceiling = %q", got)
	}
}

func TestListLevelStepsShowsTheDefaultCurve(t *testing.T) {
	steps := rules.ListLevelSteps(rules.DefaultRules(), 12)
	want := map[int]rules.LevelStep{
		0:  {Level: 1, StartXP: 0, XP: 50},
		1:  {Level: 2, StartXP: 50, XP: 75},
		10: {Level: 11, StartXP: 1625, XP: 300},
		11: {Level: 12, StartXP: 1925, XP: 300},
	}
	if len(steps) != 12 {
		t.Fatalf("%d steps", len(steps))
	}
	for index, step := range want {
		if steps[index] != step {
			t.Errorf("step %d = %+v, want %+v", index, steps[index], step)
		}
	}
}

func TestMissingLevelCoinsPayOnlyWhatIsOwed(t *testing.T) {
	gameRules := rules.DefaultRules()
	gameRules.XPCurve = rules.CurveLinear
	gameRules.XPPerLevel = 10
	gameRules.CoinsPerLevel = 3
	cases := []struct {
		earnedXP, paidCoins, want int
	}{
		{earnedXP: 0, paidCoins: 0, want: 0},
		{earnedXP: 25, paidCoins: 0, want: 6},
		{earnedXP: 25, paidCoins: 3, want: 3},
		{earnedXP: 25, paidCoins: 9, want: 0},
	}
	for _, testCase := range cases {
		got := rules.CalculateMissingLevelCoins(gameRules, testCase.earnedXP, testCase.paidCoins)
		if got != testCase.want {
			t.Errorf("%d XP with %d paid: %d coins, want %d",
				testCase.earnedXP, testCase.paidCoins, got, testCase.want)
		}
	}
}
