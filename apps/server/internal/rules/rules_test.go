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
