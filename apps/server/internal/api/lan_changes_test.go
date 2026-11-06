package api_test

import (
	"net/http"
	"strings"
	"testing"
)

func TestAdminCorrectsTheNameAndPeriodOfALAN(t *testing.T) {
	testFixture := newFixture(t)
	created := testFixture.callAdmin("POST", "/admin/api/lans",
		lanBody("herbst", "Herbst", "Europe/Berlin", 4102444800000, 4102531200000))
	if created.status != http.StatusOK {
		t.Fatalf("create: %d %s", created.status, created.body)
	}
	const path = "/admin/api/lans/2"
	response := testFixture.callAdmin(
		"PATCH",
		path,
		`{"name":" Herbst-LAN ","ends_at":4102617600000}`,
	)
	if response.status != http.StatusOK {
		t.Fatalf("correct: %d %s", response.status, response.body)
	}
	listed := testFixture.callAdmin("GET", "/admin/api/lans", "")
	if !strings.Contains(string(listed.body), `"name":"Herbst-LAN"`) ||
		!strings.Contains(string(listed.body), `"ends_at":4102617600000`) {
		t.Errorf("not corrected: %s", listed.body)
	}
	cases := []struct {
		name   string
		body   string
		status int
	}{
		{"same period again", `{"starts_at":4102444800000}`, http.StatusOK},
		{"overlaps the running LAN", `{"starts_at":1000000000000}`, http.StatusBadRequest},
		{"empty name", `{"name":"  "}`, http.StatusBadRequest},
		{"short name stays", `{"slug":"neu"}`, http.StatusBadRequest},
	}
	for _, testCase := range cases {
		response = testFixture.callAdmin("PATCH", path, testCase.body)
		if response.status != testCase.status {
			t.Errorf("%s: %d %s", testCase.name, response.status, response.body)
		}
	}
}

func TestOnlyALANWithoutPlayersCanBeDeleted(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.registerPlayer("Dabei")
	response := testFixture.callAdmin("DELETE", "/admin/api/lans/1", "")
	if response.status != http.StatusConflict ||
		!strings.Contains(string(response.body), "lan_has_players") {
		t.Fatalf("LAN with a player: %d %s", response.status, response.body)
	}
	created := testFixture.callAdmin("POST", "/admin/api/lans",
		lanBody("leer", "Leer", "Europe/Berlin", 4102444800000, 4102531200000))
	if created.status != http.StatusOK {
		t.Fatalf("create: %d %s", created.status, created.body)
	}
	if response = testFixture.callAdmin(
		"DELETE",
		"/admin/api/lans/2",
		"",
	); response.status != http.StatusOK {
		t.Fatalf("empty LAN: %d %s", response.status, response.body)
	}
	if response = testFixture.callAdmin(
		"DELETE",
		"/admin/api/lans/2",
		"",
	); response.status != http.StatusNotFound {
		t.Errorf("twice: %d %s", response.status, response.body)
	}
}
