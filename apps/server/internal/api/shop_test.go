package api_test

import (
	"slices"
	"strconv"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// purchaseResponse is the response of `POST /purchases`.
type purchaseResponse struct {
	CosmeticKey string            `json:"cosmetic_key"`
	CoinsSpent  int               `json:"coins_spent"`
	Me          store.PlayerState `json:"me"`
}

// catalogAnswer is the part of the catalog that the shop test reads.
type catalogAnswer struct {
	Cosmetics []struct {
		Key    string `json:"key"`
		Unlock string `json:"unlock"`
		Price  *int   `json:"price"`
	} `json:"cosmetics"`
}

func TestTheCatalogSellsInsteadOfUnlockingByLevel(t *testing.T) {
	testFixture := newFixture(t)
	response := testFixture.callAPI("GET", "/v1/catalog", "", "")
	catalog := decodeBody[catalogAnswer](t, response)
	for _, cosmetic := range catalog.Cosmetics {
		if cosmetic.Unlock == "level" {
			t.Errorf("%s still unlocks by level", cosmetic.Key)
		}
		if cosmetic.Unlock == "shop" && cosmetic.Price == nil {
			t.Errorf("%s has no price", cosmetic.Key)
		}
	}
}

func TestABuyNeedsCoinsAndStaysBought(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Kauft")

	response := testFixture.callAPI("POST", "/v1/purchases", token, `{"key":"headset"}`)
	requireProblem(t, response, 409, "not_enough_coins")

	playerID := testFixture.loadMe(token).ID
	admin := testFixture.callAdmin(
		"POST", "/admin/api/players/"+strconv.FormatInt(playerID, 10)+"/coins", `{"coins":10}`,
	)
	if admin.status != 200 {
		t.Fatalf("give coins: %d %s", admin.status, admin.body)
	}
	if state := testFixture.loadMe(token); state.Coins != 10 {
		t.Fatalf("coins = %d, want 10", state.Coins)
	}

	response = testFixture.callAPI("POST", "/v1/purchases", token, `{"key":"headset"}`)
	purchase := decodeBody[purchaseResponse](t, response)
	if purchase.CoinsSpent != 1 || purchase.Me.Coins != 9 {
		t.Fatalf("purchase = %+v", purchase)
	}
	if !slices.Contains(purchase.Me.Cosmetics, "headset") {
		t.Fatal("the bought headset is not unlocked")
	}

	response = testFixture.callAPI("POST", "/v1/purchases", token, `{"key":"headset"}`)
	requireProblem(t, response, 409, "already_owned")
	response = testFixture.callAPI("POST", "/v1/purchases", token, `{"key":"top-hat"}`)
	requireProblem(t, response, 400, "unknown_cosmetic")
	response = testFixture.callAPI("POST", "/v1/purchases", token, `{"key":"party-hat"}`)
	requireProblem(t, response, 409, "not_for_sale")
}

func TestALevelUpPaysCoins(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Steigt")
	playerID := testFixture.loadMe(token).ID

	// Two levels at once, from 1 to 3 with 250 XP.
	admin := testFixture.callAdmin(
		"POST", "/admin/api/players/"+strconv.FormatInt(playerID, 10)+"/xp", `{"xp":250}`,
	)
	if admin.status != 200 {
		t.Fatalf("give XP: %d %s", admin.status, admin.body)
	}
	if state := testFixture.loadMe(token); state.Level != 3 || state.Coins != 2 {
		t.Fatalf("level %d, coins %d, want 3 and 2", state.Level, state.Coins)
	}
	if got := testFixture.countEvents(
		store.EventCoinsGained, `{"amount":2,"source":"level"}`,
	); got != 1 {
		t.Fatalf("level coins announced %d times", got)
	}
	if got := testFixture.countEvents(store.EventLevelUp, `{"level":3}`); got != 1 {
		t.Fatalf("level up announced %d times", got)
	}
}

func TestTheOrgaTakesAPurchaseBackAndRefundsIt(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Zurück")
	playerID := testFixture.loadMe(token).ID
	admin := testFixture.callAdmin(
		"POST", "/admin/api/players/"+strconv.FormatInt(playerID, 10)+"/coins", `{"coins":10}`,
	)
	if admin.status != 200 {
		t.Fatalf("give coins: %d %s", admin.status, admin.body)
	}
	response := testFixture.callAPI("POST", "/v1/purchases", token, `{"key":"hood"}`)
	if response.status != 200 {
		t.Fatalf("purchase: %d %s", response.status, response.body)
	}

	// A worn cosmetic comes off with the refund.
	equip := testFixture.callAPI(
		"PUT", "/v1/cosmetics/equipped", token, `{"slot":"head","key":"hood"}`,
	)
	if equip.status != 200 {
		t.Fatalf("equip: %d %s", equip.status, equip.body)
	}
	refund := testFixture.callAdmin(
		"DELETE", "/admin/api/players/"+strconv.FormatInt(playerID, 10)+"/purchases/hood", "",
	)
	if refund.status != 200 {
		t.Fatalf("refund: %d %s", refund.status, refund.body)
	}
	state := testFixture.loadMe(token)
	if state.Coins != 10 || slices.Contains(state.Cosmetics, "hood") {
		t.Fatalf("after the refund: coins %d, cosmetics %v", state.Coins, state.Cosmetics)
	}
	if _, worn := state.Equipped["head"]; worn {
		t.Fatal("the refunded cosmetic is still worn")
	}

	refund = testFixture.callAdmin(
		"DELETE", "/admin/api/players/"+strconv.FormatInt(playerID, 10)+"/purchases/hood", "",
	)
	requireProblem(t, refund, 404, "purchase_not_found")
}

func TestBuyingEarnsTheShopAchievements(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Sammelt")
	playerID := testFixture.loadMe(token).ID
	admin := testFixture.callAdmin(
		"POST", "/admin/api/players/"+strconv.FormatInt(playerID, 10)+"/coins", `{"coins":100}`,
	)
	if admin.status != 200 {
		t.Fatalf("give coins: %d %s", admin.status, admin.body)
	}
	for _, key := range []string{
		"headset", "headset-neutral", "beanie", "pixel-glasses", "hood", "crown",
	} {
		response := testFixture.callAPI("POST", "/v1/purchases", token, `{"key":"`+key+`"}`)
		if response.status != 200 {
			t.Fatalf("purchase %s: %d %s", key, response.status, response.body)
		}
	}
	earned := []string{}
	for _, achievement := range testFixture.loadMe(token).Achievements {
		earned = append(earned, achievement.Key)
	}
	for _, key := range []string{"first-purchase", "shopaholic"} {
		if !slices.Contains(earned, key) {
			t.Errorf("%s is missing in %v", key, earned)
		}
	}
}
