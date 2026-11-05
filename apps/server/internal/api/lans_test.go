package api_test

import (
	"fmt"
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

func TestCreateLANRefusesValuesThatCannotBeRight(t *testing.T) {
	testFixture := newFixture(t)
	const start, end = 4102444800000, 4102531200000
	cases := []struct {
		name string
		body string
	}{
		{"name of spaces", lanBody("a", "   ", "Europe/Berlin", start, end)},
		{"no time zone", lanBody("b", "B", "", start, end)},
		{"zone of the server", lanBody("c", "C", "Local", start, end)},
		{
			"seconds instead of milliseconds",
			lanBody("d", "D", "Europe/Berlin", 1700000000, 1700090000),
		},
		{"never ends", lanBody("e", "E", "Europe/Berlin", start, 9000000000000000)},
		{"end before start", lanBody("f", "F", "Europe/Berlin", end, start)},
	}
	for _, testCase := range cases {
		response := testFixture.callAdmin("POST", "/admin/api/lans", testCase.body)
		if response.status != http.StatusBadRequest {
			t.Errorf("%s: %d %s", testCase.name, response.status, response.body)
		}
	}
}

// lanBody builds the request for a new LAN.
func lanBody(slug, name, timezone string, startsAt, endsAt int64) string {
	return fmt.Sprintf(
		`{"slug":%q,"name":%q,"timezone":%q,"join_code":"code","starts_at":%d,"ends_at":%d}`,
		slug, name, timezone, startsAt, endsAt,
	)
}

func TestMapImportNeedsZonesAndAKnownLAN(t *testing.T) {
	testFixture := newFixture(t)
	const path = "/admin/api/lans/1/map"
	zone := `{"version":1,"zones":[{"id":"t1","x":10,"y":10,"width":5,"height":5}]}`
	if response := testFixture.callAdmin("PUT", path, zone); response.status != http.StatusOK {
		t.Fatalf("import: %d %s", response.status, response.body)
	}
	response := testFixture.callAdmin("PUT", path, `{"version":1}`)
	if response.status != http.StatusBadRequest {
		t.Errorf("without zones: %d %s", response.status, response.body)
	}
	areas := testFixture.callAdmin("GET", "/admin/api/lans/1/areas", "")
	if !strings.Contains(string(areas.body), `"t1"`) {
		t.Errorf("a file without zones removed the zone: %s", areas.body)
	}
	response = testFixture.callAdmin("PUT", "/admin/api/lans/99/map", `{"version":1,"zones":[]}`)
	if response.status != http.StatusNotFound {
		t.Errorf("unknown LAN: %d %s", response.status, response.body)
	}
	if response = testFixture.callAdmin(
		"PUT",
		path,
		`{"version":1,"zones":[]}`,
	); response.status != http.StatusOK {
		t.Errorf("empty on purpose: %d %s", response.status, response.body)
	}
}
