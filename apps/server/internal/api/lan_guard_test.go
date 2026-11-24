package api_test

import (
	"net/http"
	"strconv"
	"testing"
	"time"
)

func TestRunningLANEndsOnlyWhenTheOrgaConfirms(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Dabei")
	past := strconv.FormatInt(testFixture.clock.Load()-time.Minute.Milliseconds(), 10)
	later := strconv.FormatInt(testFixture.clock.Load()+time.Hour.Milliseconds(), 10)

	requireProblem(t, testFixture.callAdmin("PATCH", "/admin/api/lans/1", `{"ends_at":`+past+`}`),
		http.StatusConflict, "lan_running")
	requireProblem(t,
		testFixture.callAdmin("PATCH", "/admin/api/lans/1", `{"starts_at":`+later+`}`),
		http.StatusConflict, "lan_running")
	if got := testFixture.callAPI("POST", "/v1/pokes", token, "").status; got != http.StatusOK {
		t.Fatalf("the LAN must keep running after the refused change: %d", got)
	}

	moved := testFixture.callAdmin("PATCH", "/admin/api/lans/1", `{"ends_at":`+later+`}`)
	if moved.status != http.StatusOK {
		t.Fatalf("a running LAN can still move its end: %d %s", moved.status, moved.body)
	}
	ended := testFixture.callAdmin("PATCH", "/admin/api/lans/1",
		`{"ends_at":`+past+`,"stop_running":true}`)
	if ended.status != http.StatusOK {
		t.Fatalf("confirmed end: %d %s", ended.status, ended.body)
	}
}
