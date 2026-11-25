package rules

import (
	"maps"
	"slices"
	"sort"
)

// Models of the level curve, the values of [PublicRules.XPCurve].
const (
	// CurveLinear makes every level take [PublicRules.XPPerLevel].
	CurveLinear = "linear"
	// CurveQuadratic makes every level take [PublicRules.XPPerLevelStep] more than the one before,
	// up to [PublicRules.XPPerLevelMax].
	CurveQuadratic = "quadratic"
)

// levelCurve is one model of the curve. Both functions grow with the level.
type levelCurve struct {
	// calculateLevelXP returns the XP from `level` to the next one, at least 1.
	calculateLevelXP func(level int) int
	// calculateLevelStart returns the total XP that reaches `level`.
	calculateLevelStart func(level int) int
}

// listLevelCurves returns every model by its name, built from the rules of a LAN.
func listLevelCurves() map[string]func(Rules) levelCurve {
	return map[string]func(Rules) levelCurve{
		CurveLinear:    newLinearCurve,
		CurveQuadratic: newQuadraticCurve,
	}
}

// ListXPCurves returns the names of the models, sorted.
func ListXPCurves() []string {
	return slices.Sorted(maps.Keys(listLevelCurves()))
}

// findLevelCurve returns the curve of a LAN. An unknown model counts as linear, like LANs from
// before the curves.
func findLevelCurve(gameRules Rules) levelCurve {
	newCurve, ok := listLevelCurves()[gameRules.XPCurve]
	if !ok {
		return newLinearCurve(gameRules)
	}
	return newCurve(gameRules)
}

// newLinearCurve takes the same XP for every level.
func newLinearCurve(gameRules Rules) levelCurve {
	levelXP := max(gameRules.XPPerLevel, 1)
	return levelCurve{
		calculateLevelXP: func(int) int { return levelXP },
		calculateLevelStart: func(level int) int {
			return (level - FirstLevel) * levelXP
		},
	}
}

// newQuadraticCurve takes `step` more XP each level, from `first` up to `ceiling`. The total
// grows quadratically until the ceiling, then linearly.
func newQuadraticCurve(gameRules Rules) levelCurve {
	if gameRules.XPPerLevelStep <= 0 {
		return newLinearCurve(gameRules)
	}
	first := max(gameRules.XPPerLevel, 1)
	step := gameRules.XPPerLevelStep
	ceiling := max(gameRules.XPPerLevelMax, first)
	growingLevels := countGrowingLevels(first, step, ceiling)
	return levelCurve{
		calculateLevelXP: func(level int) int {
			return min(first+step*(level-FirstLevel), ceiling)
		},
		calculateLevelStart: func(level int) int {
			levelUps := level - FirstLevel
			growing := min(levelUps, growingLevels)
			return growing*first + step*growing*(growing-1)/2 + (levelUps-growing)*ceiling
		},
	}
}

// countGrowingLevels returns how many level-ups take less than the ceiling. `step` is above 0.
func countGrowingLevels(first, step, ceiling int) int {
	return (ceiling - first + step - 1) / step
}

// findLevel returns the highest level whose start lies at or below `earnedXP`. It doubles a bound
// above the level and then searches below it, so every curve takes only a few steps.
func findLevel(curve levelCurve, earnedXP int) int {
	above := FirstLevel + 1
	for curve.calculateLevelStart(above) <= earnedXP {
		above *= 2
	}
	levelsBelow := sort.Search(above-FirstLevel, func(index int) bool {
		return curve.calculateLevelStart(FirstLevel+index+1) > earnedXP
	})
	return FirstLevel + levelsBelow
}

// LevelProgress is where a player stands within the curve.
type LevelProgress struct {
	// Level starts at [FirstLevel].
	Level int `json:"level"`
	// XPInLevel is the XP earned since the start of this level.
	XPInLevel int `json:"xp_in_level"`
	// XPForNextLevel is the XP this level takes in total.
	XPForNextLevel int `json:"xp_for_next_level"`
}

// CalculateLevel returns the level for the XP of a LAN, starting at [FirstLevel].
func CalculateLevel(gameRules Rules, earnedXP int) int {
	return findLevel(findLevelCurve(gameRules), max(earnedXP, 0))
}

// CalculateLevelProgress returns the level for the XP of a LAN and how far it is to the next one.
func CalculateLevelProgress(gameRules Rules, earnedXP int) LevelProgress {
	curve := findLevelCurve(gameRules)
	reachedXP := max(earnedXP, 0)
	level := findLevel(curve, reachedXP)
	return LevelProgress{
		Level:          level,
		XPInLevel:      reachedXP - curve.calculateLevelStart(level),
		XPForNextLevel: curve.calculateLevelXP(level),
	}
}

// LevelStep is one row of the curve, for a preview of the rules.
type LevelStep struct {
	Level int `json:"level"`
	// StartXP is the total XP that reaches this level.
	StartXP int `json:"start_xp"`
	// XP is what this level takes up to the next one.
	XP int `json:"xp"`
}

// ListLevelSteps returns the first `count` levels of the curve of a LAN.
func ListLevelSteps(gameRules Rules, count int) []LevelStep {
	curve := findLevelCurve(gameRules)
	steps := make([]LevelStep, 0, max(count, 0))
	for level := FirstLevel; level < FirstLevel+count; level++ {
		steps = append(steps, LevelStep{
			Level:   level,
			StartXP: curve.calculateLevelStart(level),
			XP:      curve.calculateLevelXP(level),
		})
	}
	return steps
}

// levelRule is a rule that changes the levels of a LAN, with its value.
type levelRule struct {
	name  string
	value any
}

// listLevelRules returns the rules that change the levels of a LAN.
func listLevelRules(gameRules Rules) []levelRule {
	return []levelRule{
		{RuleXPCurve, gameRules.XPCurve},
		{RuleXPPerLevel, gameRules.XPPerLevel},
		{RuleXPPerLevelStep, gameRules.XPPerLevelStep},
		{RuleXPPerLevelMax, gameRules.XPPerLevelMax},
		{RuleCoinsPerLevel, gameRules.CoinsPerLevel},
	}
}

// FindChangedLevelRule returns the name of the first rule that changes the levels of a LAN, or ""
// if none does. Levels would jump for everyone and take cosmetics away.
func FindChangedLevelRule(stored, changed Rules) string {
	changedRules := listLevelRules(changed)
	for index, storedRule := range listLevelRules(stored) {
		if storedRule.value != changedRules[index].value {
			return storedRule.name
		}
	}
	return ""
}
