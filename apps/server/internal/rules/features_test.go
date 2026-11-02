package rules_test

import (
	"errors"
	"slices"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const (
	hourMillis = int64(3_600_000)
	testNow    = 100 * hourMillis
)

func TestValidateRules(t *testing.T) {
	if err := rules.ValidateRules(rules.DefaultRules()); err != nil {
		t.Fatalf("default rules: %v", err)
	}
	broken := rules.DefaultRules()
	broken.PokeIntervalSeconds = 0
	if err := rules.ValidateRules(broken); !errors.Is(err, rules.ErrInvalidRules) {
		t.Errorf("zero interval: %v", err)
	}
	broken = rules.DefaultRules()
	broken.FoodXP = -1
	if err := rules.ValidateRules(broken); !errors.Is(err, rules.ErrInvalidRules) {
		t.Errorf("negative XP: %v", err)
	}
}

func TestCheckReport(t *testing.T) {
	gameRules := rules.DefaultRules()
	fullWindow := []rules.ReportEntry{}
	for index := range 8 {
		fullWindow = append(fullWindow, rules.ReportEntry{
			Action: rules.ActionFood, At: testNow - int64(index+1)*hourMillis,
		})
	}
	testCases := []struct {
		name    string
		action  string
		history []rules.ReportEntry
		want    error
	}{
		{"first report", rules.ActionFood, nil, nil},
		{"unknown report", "snack", nil, rules.ErrUnknownReport},
		{
			"same kind on cooldown", rules.ActionFood,
			[]rules.ReportEntry{{Action: rules.ActionFood, At: testNow - 60_000}},
			rules.ErrReportCooldown,
		},
		{
			"other kind has its own cooldown", rules.ActionDrink,
			[]rules.ReportEntry{{Action: rules.ActionFood, At: testNow - 60_000}},
			nil,
		},
		{"window is full", rules.ActionDrink, fullWindow, rules.ErrReportLimit},
		{
			"old reports leave the window", rules.ActionFood,
			[]rules.ReportEntry{{Action: rules.ActionFood, At: testNow - 25*hourMillis}},
			nil,
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got := rules.CheckReport(gameRules, testCase.action, testCase.history, testNow)
			if !errors.Is(got, testCase.want) {
				t.Fatalf("CheckReport() = %v, want %v", got, testCase.want)
			}
		})
	}
}

func TestCalculateReportStatus(t *testing.T) {
	foodAt := testNow - hourMillis/2
	status := rules.CalculateReportStatus(rules.DefaultRules(), []rules.ReportEntry{
		{Action: rules.ActionFood, At: foodAt},
	}, testNow)
	want := rules.ReportStatus{FoodReadyAt: foodAt + hourMillis/2, DrinkReadyAt: 0, ReportsLeft: 7}
	if status != want {
		t.Fatalf("CalculateReportStatus() = %+v, want %+v", status, want)
	}
}

func TestListUnlockedCosmetics(t *testing.T) {
	testCases := []struct {
		name  string
		facts rules.UnlockFacts
		want  []string
	}{
		{"new player", rules.UnlockFacts{CurrentLevel: 1, BestLevel: 1}, []string{}},
		{
			"permanent cosmetics stay after a LAN",
			rules.UnlockFacts{CurrentLevel: 1, BestLevel: 3},
			[]string{"headset", "beanie"},
		},
		{
			"crown needs the level in this LAN",
			rules.UnlockFacts{CurrentLevel: 1, BestLevel: 10},
			[]string{"headset", "beanie", "pixel-glasses", "hood"},
		},
		{
			"crown counts at level 10 now",
			rules.UnlockFacts{CurrentLevel: 10, BestLevel: 10},
			[]string{"headset", "beanie", "pixel-glasses", "hood", "crown"},
		},
		{
			"an event from an earlier LAN keeps the party hat",
			rules.UnlockFacts{CurrentLevel: 1, BestLevel: 1, TotalEvents: 1},
			[]string{"party-hat"},
		},
		{
			"awards add cosmetics once",
			rules.UnlockFacts{
				CurrentLevel: 1, BestLevel: 2, AwardCosmetics: []string{"golden-cup", "headset"},
			},
			[]string{"headset", "golden-cup"},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got := rules.ListUnlockedCosmetics(testCase.facts)
			if !slices.Equal(got, testCase.want) {
				t.Fatalf("ListUnlockedCosmetics() = %v, want %v", got, testCase.want)
			}
		})
	}
}

func TestFindNewAchievements(t *testing.T) {
	stats := map[rules.Metric]int{rules.MetricDrinks: 10, rules.MetricLANsAttended: 2}
	reached := findKeys(rules.FindNewAchievements(stats, nil))
	if !slices.Equal(reached, []string{"hydrated"}) {
		t.Fatalf("drinks reached: %v", reached)
	}
	if got := rules.FindNewAchievements(stats, []string{"hydrated"}); len(got) != 0 {
		t.Fatalf("already earned: %v", got)
	}
	stats[rules.MetricLANsAttended] = 3
	got := findKeys(rules.FindNewAchievements(stats, []string{"hydrated"}))
	if !slices.Equal(got, []string{"veteran"}) {
		t.Fatalf("veteran: %v", got)
	}
}

func TestAchievementCatalogIsConsistent(t *testing.T) {
	seen := map[string]bool{}
	for _, achievement := range rules.ListAchievements() {
		if seen[achievement.Key] {
			t.Errorf("duplicate key %q", achievement.Key)
		}
		seen[achievement.Key] = true
		if achievement.Title == "" || achievement.Description == "" || achievement.Goal <= 0 {
			t.Errorf("incomplete achievement %+v", achievement)
		}
		if _, found := rules.FindAchievement(achievement.Key); !found {
			t.Errorf("FindAchievement(%q) found nothing", achievement.Key)
		}
	}
}

func TestValidateCatalogKeys(t *testing.T) {
	if err := rules.ValidateEmote("wave"); err != nil {
		t.Errorf("ValidateEmote(wave) = %v", err)
	}
	if err := rules.ValidateEmote("free text"); !errors.Is(err, rules.ErrUnknownEmote) {
		t.Errorf("ValidateEmote(free text) = %v", err)
	}
	if err := rules.ValidateSign("cs2"); err != nil {
		t.Errorf("ValidateSign(cs2) = %v", err)
	}
	if err := rules.ValidateSign("free text"); !errors.Is(err, rules.ErrUnknownSign) {
		t.Errorf("ValidateSign(free text) = %v", err)
	}
}

func TestIsPresent(t *testing.T) {
	gameRules := rules.DefaultRules()
	if !rules.IsPresent(gameRules, testNow-hourMillis, testNow) {
		t.Error("one hour ago should still be present")
	}
	if rules.IsPresent(gameRules, testNow-2*hourMillis, testNow) {
		t.Error("two hours ago should be gone")
	}
}

func TestIsEmoteAllowed(t *testing.T) {
	gameRules := rules.DefaultRules()
	if !rules.IsEmoteAllowed(gameRules, 0, testNow) {
		t.Error("first emote should be allowed")
	}
	if rules.IsEmoteAllowed(gameRules, testNow-1000, testNow) {
		t.Error("emote after one second should wait")
	}
	if !rules.IsEmoteAllowed(gameRules, testNow-3000, testNow) {
		t.Error("emote after three seconds should be allowed")
	}
}

func findKeys(achievements []rules.Achievement) []string {
	keys := []string{}
	for _, achievement := range achievements {
		keys = append(keys, achievement.Key)
	}
	return keys
}
