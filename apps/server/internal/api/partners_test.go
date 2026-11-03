package api_test

import (
	"net/http"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// invitePartner asks another jelly for a partner emote and returns the invite ID.
func (testFixture *fixture) invitePartner(token, partner string) string {
	testFixture.t.Helper()
	partnerID := strconv.FormatInt(testFixture.loadMe(partner).ID, 10)
	response := testFixture.callAPI("POST", "/v1/partner-emotes", token,
		`{"key":"hop","partner_ids":[`+partnerID+`]}`)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("invite: %d %s", response.status, response.body)
	}
	invite := decodeBody[store.PartnerInviteResult](testFixture.t, response).PartnerEmote
	return strconv.FormatInt(invite.ID, 10)
}

// answerInvite sends an answer to an invite.
func (testFixture *fixture) answerInvite(token, inviteID, state string) apiResponse {
	testFixture.t.Helper()
	return testFixture.callAPI("PATCH", "/v1/partner-emotes", token,
		`{"id":`+inviteID+`,"state":"`+state+`"}`)
}

func TestPartnerEmoteFlow(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	secondID := strconv.FormatInt(testFixture.loadMe(second).ID, 10)
	firstID := strconv.FormatInt(testFixture.loadMe(first).ID, 10)

	response := testFixture.callAPI("POST", "/v1/partner-emotes", first,
		`{"key":"wave","partner_ids":[`+secondID+`]}`)
	requireProblem(t, response, http.StatusBadRequest, "unknown_partner_emote")
	response = testFixture.callAPI("POST", "/v1/partner-emotes", first,
		`{"key":"hop","partner_ids":[`+firstID+`]}`)
	requireProblem(t, response, http.StatusBadRequest, "partner_self")

	inviteID := testFixture.invitePartner(first, second)
	response = testFixture.callAPI("POST", "/v1/partner-emotes", first,
		`{"key":"hop","partner_ids":[`+secondID+`]}`)
	requireProblem(t, response, http.StatusConflict, "partner_emote_open")

	list := decodeBody[store.PartnerInviteList](t,
		testFixture.callAPI("GET", "/v1/partner-emotes", second, ""))
	if len(list.Items) != 1 || list.Items[0].FromID == 0 {
		t.Fatalf("open invites: %+v", list)
	}
	requireProblem(t, testFixture.answerInvite(first, inviteID, "accepted"),
		http.StatusBadRequest, "invalid_partner_emote_state")

	response = testFixture.answerInvite(second, inviteID, "accepted")
	result := decodeBody[store.PartnerInviteResult](t, response)
	if result.XPGained != 2 || result.PartnerEmote.State != "accepted" {
		t.Fatalf("result: %s", response.body)
	}
	if got := testFixture.loadMe(first).XP; got != 2 {
		t.Fatalf("XP of the one who asked = %d", got)
	}
	requireProblem(t, testFixture.answerInvite(second, inviteID, "accepted"),
		http.StatusConflict, "partner_emote_closed")
}

func TestPartnerXPOnlyForNewPartner(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	testFixture.answerInvite(second, testFixture.invitePartner(first, second), "accepted")

	response := testFixture.answerInvite(
		first,
		testFixture.invitePartner(second, first),
		"accepted",
	)
	if got := decodeBody[store.PartnerInviteResult](t, response).XPGained; got != 0 {
		t.Fatalf("second emote with the same partner = %d XP", got)
	}
}

func TestPartnerInviteExpiresAndConcernsOnlyTheTwo(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	stranger := testFixture.registerPlayer("C")
	inviteID := testFixture.invitePartner(first, second)
	requireProblem(t, testFixture.answerInvite(stranger, inviteID, "accepted"),
		http.StatusNotFound, "partner_emote_not_found")
	testFixture.advanceClock(3 * time.Minute)
	requireProblem(t, testFixture.answerInvite(second, inviteID, "accepted"),
		http.StatusConflict, "partner_emote_closed")
}

func TestDeclinedInviteEarnsNothing(t *testing.T) {
	testFixture := newFixture(t)
	first := testFixture.registerPlayer("A")
	second := testFixture.registerPlayer("B")
	response := testFixture.answerInvite(
		second,
		testFixture.invitePartner(first, second),
		"declined",
	)
	if got := decodeBody[store.PartnerInviteResult](t, response).XPGained; got != 0 {
		t.Fatalf("XP for declining = %d", got)
	}
}

func TestInvitesAreLimitedPerPlayer(t *testing.T) {
	testFixture := newFixture(t)
	asker := testFixture.registerPlayer("A")
	var last apiResponse
	for range 6 {
		last = testFixture.callAPI("POST", "/v1/partner-emotes", asker,
			`{"key":"hop","partner_ids":[999]}`)
	}
	requireProblem(t, last, http.StatusTooManyRequests, "rate_limited")
}

func TestPartnerEventsAndAchievements(t *testing.T) {
	testFixture := newFixture(t)
	hub := testFixture.registerPlayer("Hub")
	for index := range 3 {
		guest := testFixture.registerPlayer("Gast" + strconv.Itoa(index))
		testFixture.answerInvite(guest, testFixture.invitePartner(hub, guest), "accepted")
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
	testFixture.callAPI("PUT", "/v1/signs/current", searcher, `{"key":"cs2"}`)
	testFixture.callAPI("POST", "/v1/trips/follow", visitor, `{"player_id":`+searcherID+`}`)

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
	testFixture.callAPI("POST", "/v1/event-codes/redemptions", tokens[0], `{"code":"VOLL"}`)
	if slices.Contains(findAchievementKeys(testFixture.loadMe(tokens[0])), "full-house") {
		t.Fatal("1 of 6 is not 33 percent")
	}
	testFixture.callAPI("POST", "/v1/event-codes/redemptions", tokens[1], `{"code":"VOLL"}`)
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
