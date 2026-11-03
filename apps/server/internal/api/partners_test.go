package api_test

import (
	"net/http"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// createPartnerCode starts a partner emote and returns its code.
func (testFixture *fixture) createPartnerCode(token string) string {
	testFixture.t.Helper()
	response := testFixture.callAPI("POST", "/v1/partner-emote", token, `{"key":"hop"}`)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("offer: %d %s", response.status, response.body)
	}
	return decodeBody[store.PartnerOffer](testFixture.t, response).Code
}

// joinPartnerCode enters a code.
func (testFixture *fixture) joinPartnerCode(token, code string) apiResponse {
	testFixture.t.Helper()
	return testFixture.callAPI("POST", "/v1/partner-emote/join", token, `{"code":"`+code+`"}`)
}

func TestPartnerEmoteFlow(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")

	response := testFixture.callAPI("POST", "/v1/partner-emote", first, `{"key":"wave"}`)
	requireProblem(t, response, http.StatusBadRequest, "unknown_partner_emote")

	code := testFixture.createPartnerCode(first)
	if len(code) != 4 {
		t.Fatalf("code = %q", code)
	}
	requireProblem(t, testFixture.joinPartnerCode(first, code),
		http.StatusBadRequest, "partner_self")

	response = testFixture.joinPartnerCode(second, code)
	result := decodeBody[store.PartnerResult](t, response)
	if result.XPGained != 2 || result.EmoteKey != "hop" {
		t.Fatalf("result: %s", response.body)
	}
	if got := testFixture.loadMe(first).XP; got != 2 {
		t.Fatalf("code owner XP = %d", got)
	}
	requireProblem(t, testFixture.joinPartnerCode(second, code),
		http.StatusBadRequest, "invalid_partner_code")
}

func TestPartnerXPOnlyForNewPartner(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	testFixture.joinPartnerCode(second, testFixture.createPartnerCode(first))

	response := testFixture.joinPartnerCode(first, testFixture.createPartnerCode(second))
	if got := decodeBody[store.PartnerResult](t, response).XPGained; got != 0 {
		t.Fatalf("second emote with the same partner = %d XP", got)
	}
}

func TestPartnerCodeExpires(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	code := testFixture.createPartnerCode(first)
	testFixture.advanceClock(3 * time.Minute)
	requireProblem(t, testFixture.joinPartnerCode(second, code),
		http.StatusBadRequest, "invalid_partner_code")
}

func TestPartnerGuessingIsLimitedPerPlayer(t *testing.T) {
	testFixture := newFixture(t)
	guesser := testFixture.registerPlayer("A")
	other := testFixture.registerPlayer("B")
	var last apiResponse
	for range 6 {
		last = testFixture.joinPartnerCode(guesser, "abcd")
	}
	requireProblem(t, last, http.StatusTooManyRequests, "rate_limited")
	requireProblem(t, testFixture.joinPartnerCode(other, "abcd"),
		http.StatusBadRequest, "invalid_partner_code")
}

func TestPartnerEventsAndAchievements(t *testing.T) {
	testFixture := newFixture(t)
	hub := testFixture.registerPlayer("Hub")
	for index := range 3 {
		guest := testFixture.registerPlayer("Gast" + strconv.Itoa(index))
		testFixture.joinPartnerCode(guest, testFixture.createPartnerCode(hub))
	}
	state := testFixture.loadMe(hub)
	if !slices.Contains(findAchievementKeys(state), "sociable") {
		t.Fatalf("code owner must earn it too: %+v", state.Achievements)
	}
	events, err := testFixture.database.ListEventsAfter(t.Context(), 0)
	if err != nil {
		t.Fatal(err)
	}
	found := slices.ContainsFunc(events, func(event store.Event) bool {
		return event.Type == store.EventPartnerEmote
	})
	if !found {
		t.Fatal("the stage needs the partner event")
	}
}

func TestFoundCompanyRewardsBothJellies(t *testing.T) {
	testFixture := newFixture(t)
	searcher := testFixture.registerPlayer("A")
	visitor := testFixture.registerPlayer("B")
	searcherID := strconv.FormatInt(testFixture.loadMe(searcher).ID, 10)
	testFixture.callAPI("PUT", "/v1/sign", searcher, `{"key":"cs2"}`)
	testFixture.callAPI("PUT", "/v1/follow", visitor, `{"player_id":`+searcherID+`}`)

	for _, token := range []string{searcher, visitor} {
		keys := findAchievementKeys(testFixture.loadMe(token))
		if !slices.Contains(keys, "found-company") {
			t.Fatalf("achievement is missing: %v", keys)
		}
	}
}

func TestFullHouseReachesEarlierRedeemers(t *testing.T) {
	testFixture := newFixture(t)
	tokens := []string{}
	for index := range 6 {
		tokens = append(tokens, testFixture.registerPlayer("P"+strconv.Itoa(index)))
	}
	testFixture.createEventCode("VOLL")
	testFixture.callAPI("POST", "/v1/event-codes/redeem", tokens[0], `{"code":"VOLL"}`)
	if slices.Contains(findAchievementKeys(testFixture.loadMe(tokens[0])), "full-house") {
		t.Fatal("1 of 6 is not 33 percent")
	}
	testFixture.callAPI("POST", "/v1/event-codes/redeem", tokens[1], `{"code":"VOLL"}`)
	for _, token := range tokens[:2] {
		if !slices.Contains(findAchievementKeys(testFixture.loadMe(token)), "full-house") {
			t.Fatal("2 of 6 reach 33 percent and count for both redeemers")
		}
	}
}

func TestDayAchievementsUseLANDays(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testFixture.pokePlayer(token)
	testFixture.advanceClock(24 * time.Hour)
	testFixture.pokePlayer(token)
	if slices.Contains(findAchievementKeys(testFixture.loadMe(token)), "stuck-here") {
		t.Fatal("two days are not enough")
	}
	testFixture.advanceClock(24 * time.Hour)
	testFixture.pokePlayer(token)
	keys := findAchievementKeys(testFixture.loadMe(token))
	if !slices.Contains(keys, "stuck-here") || !slices.Contains(keys, "comeback") {
		t.Fatalf("three days and a return: %v", keys)
	}
}
