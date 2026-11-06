package api_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestMapPreviewChangesNothing(t *testing.T) {
	testFixture := newFixture(t)
	const path = "/admin/api/lans/1/map"
	zone := `{"version":1,"zones":[{"id":"t1","x":10,"y":10,"width":5,"height":5}]}`
	preview := testFixture.callAdmin("PUT", path+"?dry_run=true", zone)
	if preview.status != http.StatusOK ||
		!strings.Contains(string(preview.body), `"created":["t1"]`) {
		t.Fatalf("preview: %d %s", preview.status, preview.body)
	}
	areas := testFixture.callAdmin("GET", "/admin/api/lans/1/areas", "")
	if strings.Contains(string(areas.body), `"t1"`) {
		t.Errorf("the preview wrote the zone: %s", areas.body)
	}
	if imported := testFixture.callAdmin(
		"PUT",
		path,
		zone,
	); !strings.Contains(
		string(imported.body),
		`"created":["t1"]`,
	) {
		t.Errorf("import after the preview: %d %s", imported.status, imported.body)
	}
}

func TestAdminReadsTheRunningGathering(t *testing.T) {
	testFixture := newFixture(t)
	const path = "/admin/api/lans/1/gathering"
	if response := testFixture.callAdmin(
		"GET",
		path,
		"",
	); !strings.Contains(
		string(response.body),
		`"gathering":null`,
	) {
		t.Fatalf("without a gathering: %d %s", response.status, response.body)
	}
	started := testFixture.callAdmin("POST", path, `{"kind":"food","seconds":600}`)
	if started.status != http.StatusOK {
		t.Fatalf("start: %d %s", started.status, started.body)
	}
	if response := testFixture.callAdmin(
		"GET",
		path,
		"",
	); !strings.Contains(
		string(response.body),
		`"kind":"food"`,
	) {
		t.Errorf("running: %d %s", response.status, response.body)
	}
}

func TestEndedEventCodeCannotBeRedeemed(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Spaet")
	now := testFixture.clock.Load()
	body := fmt.Sprintf(
		`{"lan_id":1,"title":"Pizza","code":"pizza","xp":5,"valid_from":%d,"valid_until":%d}`,
		now-1000,
		now+3600000,
	)
	if created := testFixture.callAdmin(
		"POST",
		"/admin/api/event-codes",
		body,
	); created.status != http.StatusOK {
		t.Fatalf("create: %d %s", created.status, created.body)
	}
	if ended := testFixture.callAdmin(
		"POST",
		"/admin/api/event-codes/1/end",
		"",
	); ended.status != http.StatusOK {
		t.Fatalf("end: %d %s", ended.status, ended.body)
	}
	redeemed := testFixture.callAPI("POST", "/v1/event-codes/redeem", token, `{"code":"pizza"}`)
	if redeemed.status == http.StatusOK {
		t.Errorf("an ended code still gave XP: %s", redeemed.body)
	}
	if missing := testFixture.callAdmin(
		"POST",
		"/admin/api/event-codes/99/end",
		"",
	); missing.status != http.StatusNotFound {
		t.Errorf("unknown code: %d %s", missing.status, missing.body)
	}
}
