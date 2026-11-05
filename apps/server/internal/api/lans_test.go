package api_test

import (
	"net/http"
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
