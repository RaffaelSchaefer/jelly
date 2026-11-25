package rules

import "sort"

// Models of the level curve, the values of [PublicRules.XPCurve].
const (
	// CurveLinear makes every level take [PublicRules.XPPerLevel].
	CurveLinear = "linear"
	// CurveQuadratic makes every level take [PublicRules.XPPerLevelStep] more than the one before,
	// up to [PublicRules.XPPerLevelMax].
	CurveQuadratic = "quadratic"
)

// ListXPCurves returns the models of the level curve.
func ListXPCurves() []string {
	return []string{CurveLinear, CurveQuadratic}
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

// levelCurve is the XP of each level-up: `first`, then `step` more each level, at most `ceiling`.
type levelCurve struct {
	first   int
	step    int
	ceiling int
}

// findLevelCurve returns the curve of a LAN. Unknown models count as linear, like LANs from
// before the curves.
func findLevelCurve(gameRules Rules) levelCurve {
	if gameRules.XPCurve != CurveQuadratic || gameRules.XPPerLevelStep <= 0 {
		return levelCurve{gameRules.XPPerLevel, 0, gameRules.XPPerLevel}
	}
	return levelCurve{
		gameRules.XPPerLevel, gameRules.XPPerLevelStep,
		max(gameRules.XPPerLevelMax, gameRules.XPPerLevel),
	}
}

// countGrowingLevels returns how many level-ups take less than the ceiling.
func (curve levelCurve) countGrowingLevels() int {
	if curve.step == 0 {
		return 0
	}
	return (curve.ceiling - curve.first + curve.step - 1) / curve.step
}

// calculateLevelXP returns the XP from `level` to the next one.
func (curve levelCurve) calculateLevelXP(level int) int {
	return min(curve.first+curve.step*(level-FirstLevel), curve.ceiling)
}

// calculateLevelStart returns the total XP that reaches `level`.
func (curve levelCurve) calculateLevelStart(level int) int {
	levelUps := level - FirstLevel
	growing := min(levelUps, curve.countGrowingLevels())
	return growing*curve.first + curve.step*growing*(growing-1)/2 +
		(levelUps-growing)*curve.ceiling
}

// calculateLevel returns the highest level whose start lies at or below `earnedXP`.
func (curve levelCurve) calculateLevel(earnedXP int) int {
	if earnedXP <= 0 {
		return FirstLevel
	}
	// From the first level at the ceiling on, every level takes the same XP.
	flatLevel := FirstLevel + curve.countGrowingLevels()
	flatStart := curve.calculateLevelStart(flatLevel)
	if earnedXP >= flatStart {
		return flatLevel + (earnedXP-flatStart)/curve.ceiling
	}
	nextAbove := sort.Search(flatLevel-FirstLevel, func(index int) bool {
		return curve.calculateLevelStart(FirstLevel+index+1) > earnedXP
	})
	return FirstLevel + nextAbove
}

// CalculateLevel returns the level for the XP of a LAN, starting at [FirstLevel].
func CalculateLevel(gameRules Rules, earnedXP int) int {
	return findLevelCurve(gameRules).calculateLevel(earnedXP)
}

// CalculateLevelProgress returns the level for the XP of a LAN and how far it is to the next one.
func CalculateLevelProgress(gameRules Rules, earnedXP int) LevelProgress {
	curve := findLevelCurve(gameRules)
	level := curve.calculateLevel(earnedXP)
	return LevelProgress{
		Level:          level,
		XPInLevel:      max(earnedXP, 0) - curve.calculateLevelStart(level),
		XPForNextLevel: curve.calculateLevelXP(level),
	}
}

// FindChangedLevelRule returns the name of the first rule that changes the levels of a LAN, or ""
// if none does. Levels would jump for everyone and take cosmetics away.
func FindChangedLevelRule(stored, changed Rules) string {
	switch {
	case stored.XPCurve != changed.XPCurve:
		return RuleXPCurve
	case stored.XPPerLevel != changed.XPPerLevel:
		return RuleXPPerLevel
	case stored.XPPerLevelStep != changed.XPPerLevelStep:
		return RuleXPPerLevelStep
	case stored.XPPerLevelMax != changed.XPPerLevelMax:
		return RuleXPPerLevelMax
	case stored.CoinsPerLevel != changed.CoinsPerLevel:
		return RuleCoinsPerLevel
	default:
		return ""
	}
}
