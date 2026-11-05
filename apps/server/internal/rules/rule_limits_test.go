package rules_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

func TestEveryRuleHasALimitAndTheDefaultsKeepThem(t *testing.T) {
	encoded, err := json.Marshal(rules.DefaultRules())
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err = json.Unmarshal(encoded, &fields); err != nil {
		t.Fatal(err)
	}
	limits := rules.ListRuleLimits(rules.DefaultRules())
	if len(limits) != len(fields) {
		t.Errorf("%d limits for %d rules", len(limits), len(fields))
	}
	for _, limit := range limits {
		value, known := fields[limit.Name]
		if !known {
			t.Errorf("%s is not a rule", limit.Name)
		}
		if value != limit.Value {
			t.Errorf("%s reads %v, the rule is %v", limit.Name, limit.Value, value)
		}
	}
	if err = rules.ValidateRules(rules.DefaultRules()); err != nil {
		t.Errorf("defaults: %v", err)
	}
}

func TestInvalidRuleErrorNamesTheRule(t *testing.T) {
	broken := rules.DefaultRules()
	broken.TripSeconds = 1 << 62
	err := rules.ValidateRules(broken)
	if !errors.Is(err, rules.ErrInvalidRules) {
		t.Fatalf("not an invalid rule: %v", err)
	}
	var invalid rules.InvalidRuleError
	if !errors.As(err, &invalid) || invalid.Limit.Name != "trip_seconds" {
		t.Fatalf("wrong rule: %v", err)
	}
}

func TestTheDocsListTheLimitsOfEveryRule(t *testing.T) {
	docs, err := os.ReadFile("../../docs/api.md")
	if err != nil {
		t.Fatal(err)
	}
	format := func(value float64) string {
		return strings.ReplaceAll(strconv.FormatFloat(value, 'f', -1, 64), ".", ",")
	}
	for _, limit := range rules.ListRuleLimits(rules.DefaultRules()) {
		name := fmt.Sprintf("| %#q", limit.Name)
		allowed := fmt.Sprintf("%s bis %s", format(limit.Lowest), format(limit.Highest))
		found := false
		for line := range strings.SplitSeq(string(docs), "\n") {
			found = found || (strings.HasPrefix(line, name) && strings.Contains(line, allowed))
		}
		if !found {
			t.Errorf("docs/api.md does not say %s for %s", allowed, limit.Name)
		}
	}
}
