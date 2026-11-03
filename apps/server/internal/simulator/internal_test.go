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
	if len(seen) != 6 {
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

func TestOfferBoardDropsExpiredAndReplacedCodes(t *testing.T) {
	board := &offerBoard{}
	board.addOffer(partnerOffer{code: "old", botIndex: 1, expiresAt: 1000})
	board.addOffer(partnerOffer{code: "new", botIndex: 1, expiresAt: 1000})
	if offer, found := board.takeOffer(2, 500); !found || offer.code != "new" {
		t.Fatalf("a new code replaces the old one: %+v", offer)
	}
	board.addOffer(partnerOffer{code: "late", botIndex: 1, expiresAt: 1000})
	if _, found := board.takeOffer(2, 1000); found {
		t.Fatal("an expired code must not be handed out")
	}
	board.addOffer(partnerOffer{code: "own", botIndex: 1, expiresAt: 1000})
	if _, found := board.takeOffer(1, 500); found {
		t.Fatal("a bot must not take its own code")
	}
}

func TestOfferBoardReturnKeepsNewerCode(t *testing.T) {
	board := &offerBoard{}
	board.addOffer(partnerOffer{code: "new", botIndex: 1, expiresAt: 1000})
	board.returnOffer(partnerOffer{code: "old", botIndex: 1, expiresAt: 1000})
	offer, found := board.takeOffer(2, 500)
	if !found || offer.code != "new" {
		t.Fatalf("offer: %+v", offer)
	}
	if _, found = board.takeOffer(2, 500); found {
		t.Fatal("the old code must not come back")
	}
}
