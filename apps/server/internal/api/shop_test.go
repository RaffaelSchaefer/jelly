package api_test

import (
	"net/http"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

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

func TestCoinsPerLevelIsFixedOnceTheLANRuns(t *testing.T) {
	testFixture := newFixture(t)
	response := testFixture.callAdmin("PATCH", "/admin/api/lans/1/rules", `{"coins_per_level":5}`)
	requireProblem(t, response, 400, "invalid_rules")
	if !strings.Contains(string(response.body), "coins_per_level lässt sich nach dem Start") {
		t.Fatalf("message does not name the rule: %s", response.body)
	}

	// A LAN that has not started can still choose.
	testFixture.createFutureLAN()
	response = testFixture.callAdmin("PATCH", "/admin/api/lans/2/rules", `{"coins_per_level":0}`)
	if response.status != http.StatusOK {
		t.Fatalf("a LAN that has not started can change: %d %s", response.status, response.body)
	}
}

func TestWithoutCoinsPerLevelALevelUpPaysNothing(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.createFutureLAN()
	if changed := testFixture.callAdmin(
		"PATCH", "/admin/api/lans/2/rules", `{"coins_per_level":0}`,
	); changed.status != http.StatusOK {
		t.Fatalf("prepare rules: %d %s", changed.status, changed.body)
	}
	token := testFixture.registerPlayer("Still")
	testFixture.advanceClock(30 * 24 * time.Hour)
	joined := testFixture.callAPI("POST", "/v1/auth/redeem", token, `{"code":"next-code"}`)
	if joined.status != http.StatusOK {
		t.Fatalf("join: %d %s", joined.status, joined.body)
	}

	// Two levels at once, and the balance stays silent.
	playerID := testFixture.loadMe(token).ID
	admin := testFixture.callAdmin(
		"POST", "/admin/api/players/"+strconv.FormatInt(playerID, 10)+"/xp", `{"xp":250}`,
	)
	if admin.status != 200 {
		t.Fatalf("give XP: %d %s", admin.status, admin.body)
	}
	state := testFixture.loadMe(token)
	if state.Level != 3 || state.Coins != 0 {
		t.Fatalf("level %d, coins %d, want 3 and 0", state.Level, state.Coins)
	}
	if got := testFixture.countEvents(
		store.EventCoinsGained, `{"amount":0,"source":"level"}`,
	); got != 0 {
		t.Fatalf("a payment of nothing was announced %d times", got)
	}
}

func TestCoinsVanishWithTheLANButPurchasesStay(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Bleibt")
	playerID := testFixture.loadMe(token).ID
	playerPath := strconv.FormatInt(playerID, 10)
	if admin := testFixture.callAdmin(
		"POST", "/admin/api/players/"+playerPath+"/coins", `{"coins":20}`,
	); admin.status != 200 {
		t.Fatalf("give coins: %d %s", admin.status, admin.body)
	}
	for _, key := range []string{"headset", "crown"} {
		if bought := testFixture.callAPI(
			"POST", "/v1/purchases", token, `{"key":"`+key+`"}`,
		); bought.status != 200 {
			t.Fatalf("purchase %s: %d %s", key, bought.status, bought.body)
		}
	}

	testFixture.createFutureLAN()
	testFixture.advanceClock(30 * 24 * time.Hour)
	joined := testFixture.callAPI("POST", "/v1/auth/redeem", token, `{"code":"next-code"}`)
	if joined.status != http.StatusOK {
		t.Fatalf("join: %d %s", joined.status, joined.body)
	}
	state := testFixture.loadMe(token)
	if state.Coins != 0 {
		t.Fatalf("coins of the last LAN stayed: %d", state.Coins)
	}
	if !slices.Contains(state.Cosmetics, "headset") {
		t.Error("the headset purchase must stay over LANs")
	}
	if slices.Contains(state.Cosmetics, "crown") {
		t.Error("the crown of the last LAN must not stay")
	}

	// The crown is for sale again in the new LAN, and the old coins are gone.
	if bought := testFixture.callAPI(
		"POST", "/v1/purchases", token, `{"key":"crown"}`,
	); bought.status != 409 {
		t.Fatalf("crown without coins: %d %s", bought.status, bought.body)
	}
}

// loadAdminPurchases lists the purchases of one player as the admin page shows them.
func (testFixture *fixture) loadAdminPurchases(playerID int64) []store.PlayerPurchase {
	testFixture.t.Helper()
	response := testFixture.callAdmin("GET", "/admin/api/players?search=", "")
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("list players: %d %s", response.status, response.body)
	}
	players := decodeBody[[]store.PlayerSummary](testFixture.t, response)
	for _, player := range players {
		if player.ID == playerID {
			return player.Purchases
		}
	}
	testFixture.t.Fatalf("player %d is missing in the list", playerID)
	return nil
}

func TestTheOrgaTakesAPurchaseBackAndRefundsIt(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Zurück")
	playerID := testFixture.loadMe(token).ID
	playerPath := strconv.FormatInt(playerID, 10)
	admin := testFixture.callAdmin(
		"POST", "/admin/api/players/"+playerPath+"/coins", `{"coins":10}`,
	)
	if admin.status != 200 {
		t.Fatalf("give coins: %d %s", admin.status, admin.body)
	}
	response := testFixture.callAPI("POST", "/v1/purchases", token, `{"key":"hood"}`)
	if response.status != 200 {
		t.Fatalf("purchase: %d %s", response.status, response.body)
	}
	purchases := testFixture.loadAdminPurchases(playerID)
	if len(purchases) != 1 {
		t.Fatalf("purchases: %+v", purchases)
	}
	purchaseID := purchases[0].ID

	// A worn cosmetic comes off with the refund.
	equip := testFixture.callAPI(
		"PUT", "/v1/cosmetics/equipped", token, `{"slot":"head","key":"hood"}`,
	)
	if equip.status != 200 {
		t.Fatalf("equip: %d %s", equip.status, equip.body)
	}
	refund := testFixture.callAdmin(
		"DELETE", "/admin/api/players/"+playerPath+"/purchases/"+
			strconv.FormatInt(purchaseID, 10), "",
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
		"DELETE", "/admin/api/players/"+playerPath+"/purchases/"+
			strconv.FormatInt(purchaseID, 10), "",
	)
	requireProblem(t, refund, 404, "purchase_not_found")
}

// TestARefundHitsOneExactPurchase refunds the newest of two purchases of the same key in
// different LANs, and the older purchase stays untouched.
func TestARefundHitsOneExactPurchase(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Zwei Kronen")
	playerID := testFixture.loadMe(token).ID
	playerPath := strconv.FormatInt(playerID, 10)
	giftCoins := 20
	giveCoinsAndBuyCrown := func() {
		if admin := testFixture.callAdmin(
			"POST", "/admin/api/players/"+playerPath+"/coins", `{"coins":`+
				strconv.Itoa(giftCoins)+`}`,
		); admin.status != http.StatusOK {
			t.Fatalf("give coins: %d %s", admin.status, admin.body)
		}
		if bought := testFixture.callAPI(
			"POST", "/v1/purchases", token, `{"key":"crown"}`,
		); bought.status != http.StatusOK {
			t.Fatalf("purchase crown: %d %s", bought.status, bought.body)
		}
	}
	giveCoinsAndBuyCrown()

	// The same crown again in the next LAN, where the coins have vanished.
	testFixture.createFutureLAN()
	testFixture.advanceClock(30 * 24 * time.Hour)
	if joined := testFixture.callAPI(
		"POST", "/v1/auth/redeem", token, `{"code":"next-code"}`,
	); joined.status != http.StatusOK {
		t.Fatalf("join: %d %s", joined.status, joined.body)
	}
	giveCoinsAndBuyCrown()

	purchases := testFixture.loadAdminPurchases(playerID)
	if len(purchases) != 2 {
		t.Fatalf("purchases: %+v", purchases)
	}

	// Refund the purchase of the running LAN, and the older one stays.
	newest := purchases[len(purchases)-1]
	if refund := testFixture.callAdmin(
		"DELETE", "/admin/api/players/"+playerPath+"/purchases/"+
			strconv.FormatInt(newest.ID, 10), "",
	); refund.status != http.StatusOK {
		t.Fatalf("refund: %d %s", refund.status, refund.body)
	}
	if state := testFixture.loadMe(token); state.Coins != giftCoins {
		t.Fatalf("coins after the refund: %d, want %d", state.Coins, giftCoins)
	}
	remaining := testFixture.loadAdminPurchases(playerID)
	if len(remaining) != 1 || remaining[0].ID != purchases[0].ID {
		t.Fatalf("remaining purchases: %+v", remaining)
	}

	// The refunded purchase is gone.
	requireProblem(t, testFixture.callAdmin(
		"DELETE", "/admin/api/players/"+playerPath+"/purchases/"+
			strconv.FormatInt(newest.ID, 10), "",
	), http.StatusNotFound, "purchase_not_found")

	// And the older purchase goes back on its own.
	if refund := testFixture.callAdmin(
		"DELETE", "/admin/api/players/"+playerPath+"/purchases/"+
			strconv.FormatInt(purchases[0].ID, 10), "",
	); refund.status != http.StatusOK {
		t.Fatalf("refund the older purchase: %d %s", refund.status, refund.body)
	}
	if remaining := testFixture.loadAdminPurchases(playerID); len(remaining) != 0 {
		t.Fatalf("remaining purchases: %+v", remaining)
	}
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
		"headset", "headset-neutral", "beanie", "sprout", "pixel-glasses", "schnoerbi-mask", "hood",
		"long-schnoerbi", "goose", "crown", "bandana", "bell-collar", "knit-scarf", "snail-shell",
		"mini-backpack", "fairy-wings", "chicken", "piercings", "ogre-ears", "kamina-glasses",
		"cat-ears", "cyber-cat-ears", "cat-whiskers", "kitten", "yarn-ball", "cat-paws", "cat-tail",
		"nasal-helmet", "kite-shield", "octopus",
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

// listEarnedKeysOf returns the achievement keys that a player has earned.
func listEarnedKeysOf(testFixture *fixture, token string) []string {
	earned := []string{}
	for _, achievement := range testFixture.loadMe(token).Achievements {
		earned = append(earned, achievement.Key)
	}
	return earned
}

// TestAnAwardedCosmeticCountsForTheShopAchievement makes sure that a prize cosmetic closes the
// shopaholic gap, because an awarded player can never buy the same cosmetic again.
func TestAnAwardedCosmeticCountsForTheShopAchievement(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Belohnt")
	playerID := testFixture.loadMe(token).ID
	playerPath := strconv.FormatInt(playerID, 10)
	if admin := testFixture.callAdmin("POST", "/admin/api/awards",
		`{"player_id":`+playerPath+`,"title":"Lauter Player","cosmetic_key":"headset"}`,
	); admin.status != http.StatusOK {
		t.Fatalf("award headset: %d %s", admin.status, admin.body)
	}
	if admin := testFixture.callAdmin(
		"POST", "/admin/api/players/"+playerPath+"/coins", `{"coins":100}`,
	); admin.status != http.StatusOK {
		t.Fatalf("give coins: %d %s", admin.status, admin.body)
	}
	for _, key := range []string{
		"headset-neutral", "beanie", "sprout", "pixel-glasses", "schnoerbi-mask", "hood",
		"long-schnoerbi", "goose", "bandana", "bell-collar", "knit-scarf", "snail-shell",
		"mini-backpack", "fairy-wings", "chicken", "piercings", "ogre-ears", "kamina-glasses",
		"cat-ears", "cyber-cat-ears", "cat-whiskers", "kitten", "yarn-ball", "cat-paws", "cat-tail",
		"nasal-helmet", "kite-shield", "octopus",
	} {
		if bought := testFixture.callAPI(
			"POST", "/v1/purchases", token, `{"key":"`+key+`"}`,
		); bought.status != http.StatusOK {
			t.Fatalf("purchase %s: %d %s", key, bought.status, bought.body)
		}
	}
	if earned := listEarnedKeysOf(testFixture, token); !slices.Contains(earned, "shopaholic") {
		t.Errorf("shopaholic is missing in %v", earned)
	}
}
