package api_test

import (
	"net/http"
	"strings"
	"testing"
)

func TestCreateLANChecksTheTimeZone(t *testing.T) {
	testFixture := newFixture(t)
	const period = `"join_code":"code","starts_at":4102444800000,"ends_at":4102531200000`

	body := `{"slug":"typo","name":"Typo","timezone":"Europe/Berlinn",` + period + `}`
	response := testFixture.callAdmin("POST", "/admin/api/lans", body)
	if response.status != http.StatusBadRequest {
		t.Fatalf("unknown time zone: %d %s", response.status, response.body)
	}

	body = `{"slug":"good","name":"Good","timezone":"Europe/Berlin",` + period + `}`
	response = testFixture.callAdmin("POST", "/admin/api/lans", body)
	if response.status != http.StatusOK {
		t.Fatalf("known time zone: %d %s", response.status, response.body)
	}
}

func TestCreateLANAnswersWhenTheShortNameIsTaken(t *testing.T) {
	testFixture := newFixture(t)
	first := `{"slug":"same","name":"Eins","timezone":"Europe/Berlin","join_code":"a",` +
		`"starts_at":4102444800000,"ends_at":4102531200000}`
	second := `{"slug":"same","name":"Zwei","timezone":"Europe/Berlin","join_code":"b",` +
		`"starts_at":4103000000000,"ends_at":4103100000000}`
	if response := testFixture.callAdmin(
		"POST",
		"/admin/api/lans",
		first,
	); response.status != http.StatusOK {
		t.Fatalf("first LAN: %d %s", response.status, response.body)
	}
	response := testFixture.callAdmin("POST", "/admin/api/lans", second)
	if response.status != http.StatusConflict ||
		!strings.Contains(string(response.body), "slug_taken") {
		t.Fatalf("second LAN: %d %s", response.status, response.body)
	}
}

func TestLANCodeIgnoresSpacesAroundIt(t *testing.T) {
	testFixture := newFixture(t)
	response := testFixture.callAdmin(
		"PUT",
		"/admin/api/lans/1/join-code",
		`{"join_code":"  neu  "}`,
	)
	if response.status != http.StatusOK {
		t.Fatalf("replace code: %d %s", response.status, response.body)
	}
	if answer := testFixture.redeemLANCode("neu", "Ohne"); answer.status != http.StatusOK {
		t.Errorf("without spaces: %d %s", answer.status, answer.body)
	}
	if answer := testFixture.redeemLANCode(" neu ", "Mit"); answer.status != http.StatusOK {
		t.Errorf("with spaces: %d %s", answer.status, answer.body)
	}
	response = testFixture.callAdmin("PUT", "/admin/api/lans/1/join-code", `{"join_code":"   "}`)
	if response.status != http.StatusBadRequest {
		t.Errorf("only spaces: %d %s", response.status, response.body)
	}
}
