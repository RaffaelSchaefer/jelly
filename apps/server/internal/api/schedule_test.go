package api_test

import (
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const schedulePath = "/admin/api/lans/1/schedule"

func TestOrgaKeepsTheScheduleAndAppsReadIt(t *testing.T) {
	testFixture := newFixture(t)
	lunch := strconv.FormatInt(readLANStart().Add(24*time.Hour).UnixMilli(), 10)
	start := strconv.FormatInt(readLANStart().UnixMilli(), 10)
	response := testFixture.callAdmin("PUT", schedulePath, `{"items":[`+
		`{"starts_at":`+lunch+`,"ends_at":null,"title":"Mittag","detail":"Chili","kind":"food"},`+
		`{"starts_at":`+start+`,"ends_at":null,"title":"Einlass","detail":null,"kind":"orga"}]}`)
	if response.status != http.StatusOK {
		t.Fatalf("replace: %d %s", response.status, response.body)
	}
	read := decodeBody[api.Schedule](
		t,
		testFixture.callAPI("GET", "/v1/lans/current/schedule", "", ""),
	)
	if len(read.Items) != 2 || read.Items[0].Title != "Einlass" ||
		*read.Items[1].Detail != "Chili" {
		t.Fatalf("schedule = %+v", read.Items)
	}
	if testFixture.countEvents(store.EventScheduleChanged, "{}") != 1 {
		t.Fatal("open apps must hear about the new schedule")
	}
	admin := decodeBody[api.Schedule](t, testFixture.callAdmin("GET", schedulePath, ""))
	if len(admin.Items) != 2 {
		t.Fatalf("admin schedule = %+v", admin.Items)
	}
}

func TestScheduleOutsideTheLANIsRefused(t *testing.T) {
	testFixture := newFixture(t)
	early := strconv.FormatInt(readLANStart().Add(-time.Hour).UnixMilli(), 10)
	body := `{"items":[{"starts_at":` + early +
		`,"ends_at":null,"title":"Aufbau","detail":null,"kind":"orga"}]}`
	requireProblem(t, testFixture.callAdmin("PUT", schedulePath, body),
		http.StatusBadRequest, "invalid_schedule")
}

func TestScheduleIsEmptyWithoutAProgram(t *testing.T) {
	testFixture := newFixture(t)
	read := decodeBody[api.Schedule](
		t,
		testFixture.callAPI("GET", "/v1/lans/current/schedule", "", ""),
	)
	if read.Items == nil || len(read.Items) != 0 {
		t.Fatalf("schedule = %+v", read.Items)
	}
}
