package api_test

import (
	"fmt"
	"net/http"
	"testing"
)

func TestEventCodesHaveLimits(t *testing.T) {
	testFixture := newFixture(t)
	const start, day = 4102444800000, 86400000
	cases := []struct {
		name   string
		xp     int
		length int64
		status int
	}{
		{"most XP", 10000, day, http.StatusOK},
		{"too much XP", 10001, day, http.StatusBadRequest},
		{"negative XP", -1, day, http.StatusBadRequest},
		{"longest time", 5, 60 * day, http.StatusOK},
		{"too long", 5, 61 * day, http.StatusBadRequest},
	}
	for index, testCase := range cases {
		body := fmt.Sprintf(
			`{"lan_id":1,"title":"T","code":"c%d","xp":%d,"valid_from":%d,"valid_until":%d}`,
			index, testCase.xp, int64(start), start+testCase.length,
		)
		response := testFixture.callAdmin("POST", "/admin/api/event-codes", body)
		if response.status != testCase.status {
			t.Errorf("%s: %d %s", testCase.name, response.status, response.body)
		}
	}
}
