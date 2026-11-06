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
	broken = rules.DefaultRules()
	broken.FullHousePercent = 0
	if err := rules.ValidateRules(broken); !errors.Is(err, rules.ErrInvalidRules) {
		t.Errorf("zero percent: %v", err)
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
			[]string{"headset", "headset-neutral", "beanie"},
		},
		{
			"crown needs the level in this LAN",
			rules.UnlockFacts{CurrentLevel: 1, BestLevel: 10},
			[]string{"headset", "headset-neutral", "beanie", "pixel-glasses", "hood"},
		},
		{
			"crown counts at level 10 now",
			rules.UnlockFacts{CurrentLevel: 10, BestLevel: 10},
			[]string{"headset", "headset-neutral", "beanie", "pixel-glasses", "hood", "crown"},
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
			[]string{"headset", "headset-neutral", "golden-cup"},
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
	stats := map[rules.Metric]int{rules.MetricDrinks: 10, rules.MetricLANsAttended: 1}
	reached := findKeys(rules.FindNewAchievements(stats, nil))
	if !slices.Equal(reached, []string{"hydrated"}) {
		t.Fatalf("drinks reached: %v", reached)
	}
	if got := rules.FindNewAchievements(stats, []string{"hydrated"}); len(got) != 0 {
		t.Fatalf("already earned: %v", got)
	}
	stats[rules.MetricLANsAttended] = 3
	got := findKeys(rules.FindNewAchievements(stats, []string{"hydrated"}))
	if !slices.Equal(got, []string{"returning", "veteran"}) {
		t.Fatalf("attendance: %v", got)
	}
}

func TestRecordAchievementsHaveOneStage(t *testing.T) {
	for _, key := range []string{"night-owl", "marathon"} {
		achievement, found := rules.FindAchievement(key)
		if !found || achievement.RecordUnit == "" {
			t.Errorf("%s must track a record: %+v", key, achievement)
		}
	}
	got := findKeys(rules.FindRecordAchievements([]string{"marathon", "hatched"}))
	if !slices.Equal(got, []string{"marathon"}) {
		t.Fatalf("FindRecordAchievements() = %v", got)
	}
	reached := map[rules.Metric]int{rules.MetricSessionHours: 25}
	if again := rules.FindNewAchievements(reached, []string{"marathon"}); len(again) != 0 {
		t.Fatalf("a higher value must not earn anything new: %v", again)
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

func TestDirectAchievementsNeverComeFromStats(t *testing.T) {
	stats := map[rules.Metric]int{rules.MetricGrantedDirectly: 0}
	for _, achievement := range rules.FindNewAchievements(stats, nil) {
		if achievement.Metric == rules.MetricGrantedDirectly {
			t.Fatalf("%s was granted by an evaluation", achievement.Key)
		}
	}
}

func TestIsFullHouse(t *testing.T) {
	gameRules := rules.DefaultRules()
	testCases := []struct {
		redeemers, joined int
		want              bool
	}{
		{0, 0, false},
		{23, 70, false},
		{24, 70, true},
		{1, 3, true},
	}
	for _, testCase := range testCases {
		got := rules.IsFullHouse(gameRules, testCase.redeemers, testCase.joined)
		if got != testCase.want {
			t.Errorf("IsFullHouse(%d, %d) = %v", testCase.redeemers, testCase.joined, got)
		}
	}
}

func TestLocalTimeCounting(t *testing.T) {
	moments := []rules.LocalMoment{
		{Day: 25, Hour: 12},
		{Day: 26, Hour: 3},
		{Day: 26, Hour: 12},
		{Day: 27, Hour: 0},
	}
	if got := rules.CountLANDays(moments); got != 2 {
		t.Errorf("CountLANDays() = %d, want 2: a night belongs to the day before", got)
	}
	if got := rules.CountNightsAtHour(moments, rules.GhostHour); got != 1 {
		t.Errorf("ghost hours = %d, want 1", got)
	}
	if got := rules.CountNightsAtHour(moments, rules.NightOwlHour); got != 0 {
		t.Errorf("owl nights = %d, want 0", got)
	}
}

func TestPartnerEmotesAreSeparateFromEmotes(t *testing.T) {
	if err := rules.ValidatePartnerEmote("hop"); err != nil {
		t.Errorf("hop: %v", err)
	}
	if err := rules.ValidatePartnerEmote("wave"); !errors.Is(err, rules.ErrUnknownPartnerEmote) {
		t.Errorf("wave: %v", err)
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

func TestRulesNeedRoomForStreams(t *testing.T) {
	broken := rules.DefaultRules()
	broken.MaxStreams = 0
	if !errors.Is(rules.ValidateRules(broken), rules.ErrInvalidRules) {
		t.Error("a LAN without any stream must be rejected")
	}
	broken = rules.DefaultRules()
	broken.MaxPlayerStreams = 0
	if !errors.Is(rules.ValidateRules(broken), rules.ErrInvalidRules) {
		t.Error("a LAN without streams per player must be rejected")
	}
}

func TestValidateClientVersion(t *testing.T) {
	for _, version := range []string{"", "1.2.3", "0.0.1", "12.0.40"} {
		if err := rules.ValidateClientVersion(version); err != nil {
			t.Errorf("%q: %v", version, err)
		}
	}
	for _, version := range []string{
		"1", "1.2", "1.2.3.4", "v1.2.3", "1.2.x", "1..3", "1.2.3-beta",
	} {
		if !errors.Is(rules.ValidateClientVersion(version), rules.ErrInvalidClientVersion) {
			t.Errorf("%q must be rejected", version)
		}
	}
}

func TestValidateEquip(t *testing.T) {
	palette := rules.ListCosmeticColors()[0]
	other := "#123456"
	testCases := []struct {
		name, slot, key string
		color           *string
		want            error
	}{
		{"fixed cosmetic", rules.SlotHead, "crown", nil, nil},
		{"color from the palette", rules.SlotHead, "beanie", &palette, nil},
		{"emptying a slot", rules.SlotAura, "", nil, nil},
		{"unknown slot", "tail", "", nil, rules.ErrUnknownSlot},
		{"other slot", rules.SlotFace, "crown", nil, rules.ErrUnknownCosmetic},
		{
			"color outside the palette",
			rules.SlotHead,
			"beanie",
			&other,
			rules.ErrInvalidCosmeticColor,
		},
		{
			"color on a fixed cosmetic",
			rules.SlotHead,
			"crown",
			&palette,
			rules.ErrInvalidCosmeticColor,
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got := rules.ValidateEquip(testCase.slot, testCase.key, testCase.color)
			if !errors.Is(got, testCase.want) {
				t.Fatalf("ValidateEquip() = %v, want %v", got, testCase.want)
			}
		})
	}
}
