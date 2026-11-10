package rules_test

import (
	"errors"
	"slices"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

func TestCheckPurchase(t *testing.T) {
	headset, _ := rules.FindCosmetic("headset")
	crown, _ := rules.FindCosmetic("crown")
	hat, _ := rules.FindCosmetic("party-hat")
	tests := []struct {
		name     string
		cosmetic rules.Cosmetic
		coins    int
		isOwned  bool
		want     error
	}{
		{"affordable", headset, headset.Price, false, nil},
		{"exactly the price", crown, crown.Price, false, nil},
		{"too expensive", crown, crown.Price - 1, false, rules.ErrNotEnoughCoins},
		{"too few coins", headset, 0, false, rules.ErrNotEnoughCoins},
		{"already owned", headset, headset.Price, true, rules.ErrAlreadyOwned},
		{"not in the shop", hat, 100, false, rules.ErrNotForSale},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := rules.CheckPurchase(test.cosmetic, test.coins, test.isOwned)
			if !errors.Is(got, test.want) {
				t.Errorf("CheckPurchase(%s, %d coins, owned %v) = %v, want %v",
					test.cosmetic.Key, test.coins, test.isOwned, got, test.want)
			}
		})
	}
}

func TestListUnlockedCosmeticsSkipsShopWithoutPurchase(t *testing.T) {
	facts := rules.UnlockFacts{TotalEvents: 1}
	unlocked := rules.ListUnlockedCosmetics(facts)
	for _, cosmetic := range rules.ListCosmetics() {
		if cosmetic.Unlock != rules.UnlockShop {
			continue
		}
		if slices.Contains(unlocked, cosmetic.Key) {
			t.Errorf("%s is unlocked without a purchase", cosmetic.Key)
		}
	}
}

func TestListUnlockedCosmeticsWithPurchases(t *testing.T) {
	facts := rules.UnlockFacts{PurchasedCosmetics: []string{"headset", "crown"}}
	unlocked := rules.ListUnlockedCosmetics(facts)
	for _, key := range []string{"headset", "crown"} {
		if !slices.Contains(unlocked, key) {
			t.Errorf("%s is not unlocked with a purchase", key)
		}
	}
}

func TestListPermanentShopCosmetics(t *testing.T) {
	if got, want := len(rules.ListPermanentShopCosmetics()), 5; got != want {
		t.Errorf("len(ListPermanentShopCosmetics()) = %d, want %d", got, want)
	}
}

func TestCalculateCoinsForLevels(t *testing.T) {
	gameRules := rules.DefaultRules()
	tests := []struct {
		name   string
		levels int
		want   int
	}{
		{"no level", 0, 0},
		{"one level", 1, gameRules.CoinsPerLevel},
		{"several levels", 3, 3 * gameRules.CoinsPerLevel},
	}
	for _, test := range tests {
		if got := rules.CalculateCoinsForLevels(gameRules, test.levels); got != test.want {
			t.Errorf("%s: CalculateCoinsForLevels(%d) = %d, want %d",
				test.name, test.levels, got, test.want)
		}
	}
}
