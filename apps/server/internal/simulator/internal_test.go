package simulator

import (
	"testing"
	"time"
)

func TestChooseActionCoversAllWeights(t *testing.T) {
	seen := map[string]bool{}
	for roll := range totalWeight() {
		seen[chooseAction(roll)] = true
	}
	if len(seen) != 7 {
		t.Fatalf("actions: %v", seen)
	}
}

func TestCalculateRegisterRetryGrowsWithALimit(t *testing.T) {
	noJitter := func(int) int { return 0 }
	if got := calculateRegisterRetry(0, noJitter); got != 250*time.Millisecond {
		t.Errorf("first retry = %v", got)
	}
	if got := calculateRegisterRetry(2, noJitter); got != time.Second {
		t.Errorf("third retry = %v", got)
	}
	if got := calculateRegisterRetry(50, noJitter); got != 5*time.Second {
		t.Errorf("late retry = %v", got)
	}
	withJitter := func(limit int) int { return limit - 1 }
	if got := calculateRegisterRetry(0, withJitter); got < 499*time.Millisecond {
		t.Errorf("jitter must add up to the delay again: %v", got)
	}
}
