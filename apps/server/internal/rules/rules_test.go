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
		if got := rules.CalculateLevel(testCase.XP); got != testCase.Level {
			t.Errorf("CalculateLevel(%d) = %d, want %d", testCase.XP, got, testCase.Level)
		}
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
		{"desk", rules.Area{X: 4, Y: 5, Width: 43, Height: 2, Kind: "desk"}, true},
		{"cable", rules.Area{X: 49, Y: 2, Width: 2, Height: 97, Kind: "cable"}, true},
		{"stage", rules.Area{X: 5, Y: 1, Width: 90, Height: 8, Kind: "stage"}, true},
		{"lounge", rules.Area{X: 5, Y: 12, Width: 40, Height: 10, Kind: "lounge"}, true},
		{"snackbar", rules.Area{X: 65, Y: 14, Width: 20, Height: 3, Kind: "snackbar"}, true},
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
		"desk": false, "cable": false, "snackbar": false,
	} {
		if rules.IsStandingKind(kind) != isStanding {
			t.Errorf("IsStandingKind(%q) = %v", kind, !isStanding)
		}
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
