package rules_test

import (
	"encoding/json"
	"errors"
	"os"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// contractCases mirrors `testdata/contract/rules.json`, which other languages can read too.
type contractCases struct {
	Rules rules.Rules `json:"rules"`
	Poke  []struct {
		Name           string       `json:"name"`
		Rules          *rules.Rules `json:"rules"`
		ElapsedSeconds *int64       `json:"elapsed_seconds"`
		XP             int          `json:"xp"`
	} `json:"poke"`
	Level []struct {
		XP    int `json:"xp"`
		Level int `json:"level"`
	} `json:"level"`
	Name []struct {
		Input  string `json:"input"`
		Output string `json:"output"`
		Valid  *bool  `json:"valid"`
	} `json:"name"`
	Coins []struct {
		Name   string       `json:"name"`
		Rules  *rules.Rules `json:"rules"`
		Levels int          `json:"levels"`
		Coins  int          `json:"coins"`
	} `json:"coins"`
	Purchases []struct {
		Name  string  `json:"name"`
		Key   string  `json:"key"`
		Coins int     `json:"coins"`
		Owned bool    `json:"owned"`
		Error *string `json:"error"`
	} `json:"purchases"`
}

func loadContractCases(t *testing.T) contractCases {
	t.Helper()
	data, err := os.ReadFile("../../testdata/contract/rules.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases contractCases
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	return cases
}

func TestDefaultRulesMatchContract(t *testing.T) {
	got, want := rules.DefaultRules(), loadContractCases(t).Rules
	if got != want {
		t.Fatalf("DefaultRules() = %+v, contract = %+v", got, want)
	}
}

func TestCalculatePokeXP(t *testing.T) {
	cases := loadContractCases(t)
	const now = int64(10_000_000)
	for _, testCase := range cases.Poke {
		t.Run(testCase.Name, func(t *testing.T) {
			gameRules := cases.Rules
			if testCase.Rules != nil {
				gameRules = *testCase.Rules
			}
			lastPokeAt := rules.NoPokeYet
			if testCase.ElapsedSeconds != nil {
				lastPokeAt = now - *testCase.ElapsedSeconds*1000
			}
			if got := rules.CalculatePokeXP(gameRules, lastPokeAt, now); got != testCase.XP {
				t.Fatalf("CalculatePokeXP() = %d, want %d", got, testCase.XP)
			}
		})
	}
}

func TestCalculateNextPokeTime(t *testing.T) {
	gameRules := rules.DefaultRules()
	if got := rules.CalculateNextPokeTime(gameRules, rules.NoPokeYet, 5_000); got != 5_000 {
		t.Fatalf("without poke = %d, want the join time", got)
	}
	if got := rules.CalculateNextPokeTime(gameRules, 1_000, 5_000); got != 901_000 {
		t.Fatalf("after poke = %d, want 901000", got)
	}
}

func TestCalculateLevel(t *testing.T) {
	for _, testCase := range loadContractCases(t).Level {
		if got := rules.CalculateLevel(rules.DefaultRules(), testCase.XP); got != testCase.Level {
			t.Errorf("CalculateLevel(%d) = %d, want %d", testCase.XP, got, testCase.Level)
		}
	}
}

func TestCalculateCoinsForLevelsContract(t *testing.T) {
	cases := loadContractCases(t)
	for _, testCase := range cases.Coins {
		t.Run(testCase.Name, func(t *testing.T) {
			gameRules := cases.Rules
			if testCase.Rules != nil {
				gameRules = *testCase.Rules
			}
			got := rules.CalculateCoinsForLevels(gameRules, testCase.Levels)
			if got != testCase.Coins {
				t.Fatalf("CalculateCoinsForLevels(%d) = %d, want %d",
					testCase.Levels, got, testCase.Coins)
			}
		})
	}
}

// purchaseError turns the code of the contract case into its error, none for null.
func purchaseError(code *string) error {
	if code == nil {
		return nil
	}
	switch *code {
	case "unknown_cosmetic":
		return rules.ErrUnknownCosmetic
	case "not_for_sale":
		return rules.ErrNotForSale
	case "already_owned":
		return rules.ErrAlreadyOwned
	case "not_enough_coins":
		return rules.ErrNotEnoughCoins
	default:
		return nil
	}
}

func TestCheckPurchaseContract(t *testing.T) {
	for _, testCase := range loadContractCases(t).Purchases {
		t.Run(testCase.Name, func(t *testing.T) {
			cosmetic, found := rules.FindCosmetic(testCase.Key)
			got := rules.ErrUnknownCosmetic
			if found {
				got = rules.CheckPurchase(cosmetic, testCase.Coins, testCase.Owned)
			}
			want := purchaseError(testCase.Error)
			if !errors.Is(got, want) {
				t.Fatalf("CheckPurchase(%q) = %v, want %v", testCase.Key, got, want)
			}
		})
	}
}

func TestNormalizeName(t *testing.T) {
	for _, testCase := range loadContractCases(t).Name {
		got, err := rules.NormalizeName(testCase.Input)
		if testCase.Valid != nil && !*testCase.Valid {
			if !errors.Is(err, rules.ErrInvalidName) {
				t.Errorf("NormalizeName(%q) = %q, %v", testCase.Input, got, err)
			}
			continue
		}
		if err != nil || got != testCase.Output {
			t.Errorf("NormalizeName(%q) = %q, %v", testCase.Input, got, err)
		}
	}
}

func TestValidateColor(t *testing.T) {
	for _, color := range []string{"mint", "lilac", "peach"} {
		if err := rules.ValidateColor(color); err != nil {
			t.Errorf("ValidateColor(%q) = %v", color, err)
		}
	}
	if err := rules.ValidateColor("red"); !errors.Is(err, rules.ErrInvalidColor) {
		t.Errorf("ValidateColor(red) = %v", err)
	}
}

func TestValidateArea(t *testing.T) {
	testCases := []struct {
		name  string
		area  rules.Area
		valid bool
	}{
		{"seats", rules.Area{X: 0, Y: 0, Width: 100, Height: 100, Kind: "seats"}, true},
		{"fractions", rules.Area{X: 7.86, Y: 1.5, Width: 4.76, Height: 2, Kind: "none"}, true},
		{"old desk", rules.Area{X: 4, Y: 5, Width: 43, Height: 2, Kind: "desk"}, false},
		{"stage", rules.Area{X: 5, Y: 1, Width: 90, Height: 8, Kind: "stage"}, true},
		{"lounge", rules.Area{X: 5, Y: 12, Width: 40, Height: 10, Kind: "lounge"}, true},
		{"queue", rules.Area{X: 65, Y: 14, Width: 20, Height: 3, Kind: "queue"}, true},
		{"public", rules.Area{X: 65, Y: 14, Width: 20, Height: 3, Kind: "public"}, true},
		{"missing kind", rules.Area{X: 0, Y: 0, Width: 10, Height: 10, Kind: ""}, false},
		{"unknown kind", rules.Area{X: 0, Y: 0, Width: 10, Height: 10, Kind: "plant"}, false},
		{"outside", rules.Area{X: 95, Y: 0, Width: 10, Height: 10, Kind: "seats"}, false},
		{"no size", rules.Area{X: 0, Y: 0, Width: 0, Height: 10, Kind: "seats"}, false},
	}
	for _, testCase := range testCases {
		err := rules.ValidateArea(testCase.area)
		if (err == nil) != testCase.valid {
			t.Errorf("%s: ValidateArea = %v", testCase.name, err)
		}
		if err != nil && !errors.Is(err, rules.ErrInvalidArea) {
			t.Errorf("%s: unexpected error %v", testCase.name, err)
		}
	}
}

func TestOnlySeatsStageAndLoungeHoldJellies(t *testing.T) {
	for kind, isStanding := range map[string]bool{
		"seats": true, "stage": true, "lounge": true,
		"queue": false, "public": false, "spectators": false, "winner": false, "none": false,
	} {
		if rules.IsStandingKind(kind) != isStanding {
			t.Errorf("IsStandingKind(%q) = %v", kind, !isStanding)
		}
	}
}

func TestFreeFloorEndsAtEveryBlockingZone(t *testing.T) {
	areas := []rules.Area{
		{X: 10, Y: 10, Width: 10, Height: 10, Kind: "none", Blocks: true, Prop: "couch"},
		{X: 40, Y: 10, Width: 10, Height: 10, Kind: "seats", Blocks: false, Prop: ""},
	}
	testCases := []struct {
		point rules.StagePoint
		free  bool
	}{
		{rules.StagePoint{X: 15, Y: 15}, false},
		{rules.StagePoint{X: 45, Y: 15}, true},
		{rules.StagePoint{X: 30, Y: 30}, true},
		{rules.StagePoint{X: 130, Y: 30}, false},
	}
	for _, testCase := range testCases {
		if rules.IsOnFreeFloor(testCase.point, areas) != testCase.free {
			t.Errorf("point %+v, want free = %v", testCase.point, testCase.free)
		}
	}
}

func TestMapChecksFindEveryBadZone(t *testing.T) {
	good := rules.MapZone{
		ID:     "a",
		Name:   "A",
		X:      1,
		Y:      1,
		Width:  1,
		Height: 1,
		Blocks: false,
		Prop:   "",
	}
	again := good
	outside := good
	outside.ID, outside.X = "c", 100
	missing := good
	missing.ID = ""
	invalid := rules.ListInvalidMapZones([]rules.MapZone{good, again, outside, missing})
	if len(invalid) != 3 || invalid[0] != "a" || invalid[1] != "c" || invalid[2] != "" {
		t.Fatalf("invalid = %v", invalid)
	}
	if !rules.IsMapSizeValid(rules.RoomMap{Version: 2, Zones: nil}) ||
		rules.IsMapSizeValid(rules.RoomMap{Version: 3, Zones: nil}) {
		t.Fatal("only formats 1 and 2 are known")
	}
}

func TestUnknownPropsAreListedOnce(t *testing.T) {
	zone := func(prop string) rules.MapZone {
		return rules.MapZone{
			ID:     prop,
			Name:   "",
			X:      0,
			Y:      0,
			Width:  1,
			Height: 1,
			Blocks: false,
			Prop:   prop,
		}
	}
	unknown := rules.ListUnknownProps(
		[]rules.MapZone{zone("couch"), zone("yacht"), zone(""), zone("yacht"), zone("kraken")},
	)
	if len(unknown) != 2 || unknown[0] != "kraken" || unknown[1] != "yacht" {
		t.Fatalf("unknown = %v", unknown)
	}
}

func TestHomeSpotsFillTheirAreaEvenly(t *testing.T) {
	area := rules.Area{X: 20, Y: 40, Width: 30, Height: 50, Kind: "seats"}
	const columns, rows, places = 3, 3, 18
	var counts [columns * rows]int
	for place := range places {
		spot := rules.CalculateHomeSpot(area, place)
		column := int((spot.X - float64(area.X)) / float64(area.Width) * columns)
		row := int((spot.Y - float64(area.Y)) / float64(area.Height) * rows)
		counts[row*columns+column]++
		if spot.X < 23 || spot.X > 47 || spot.Y < 45 || spot.Y > 85 {
			t.Errorf("place %d leaves the margin: %+v", place, spot)
		}
	}
	for cell, count := range counts {
		if count == 0 {
			t.Errorf("cell %d stays empty: %v", cell, counts)
		}
	}
}
