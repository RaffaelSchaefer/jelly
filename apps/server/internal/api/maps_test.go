package api_test

import (
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const mapPath = "/admin/api/lans/1/map"

// importMap sends zones as a map file.
func (testFixture *fixture) importMap(zones string) store.MapImportReport {
	testFixture.t.Helper()
	response := testFixture.callAdmin("PUT", mapPath, `{"version":1,"zones":[`+zones+`]}`)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("import: %d %s", response.status, response.body)
	}
	return decodeBody[store.MapImportReport](testFixture.t, response)
}

// findMapArea returns the area with this ID of the map file.
func (testFixture *fixture) findMapArea(mapID string) store.AdminArea {
	testFixture.t.Helper()
	listing := decodeBody[struct {
		Areas []store.AdminArea `json:"areas"`
	}](testFixture.t, testFixture.callAdmin("GET", "/admin/api/lans/1/areas", ""))
	for _, area := range listing.Areas {
		if area.MapID == mapID {
			return area
		}
	}
	testFixture.t.Fatalf("no area %q in %+v", mapID, listing.Areas)
	return store.AdminArea{}
}

// assignKind gives an imported zone its assignment, as an admin does.
func (testFixture *fixture) assignKind(area store.AdminArea, kind string) {
	testFixture.t.Helper()
	body := `{"x":` + strconv.FormatFloat(area.X, 'f', -1, 64) +
		`,"y":` + strconv.FormatFloat(area.Y, 'f', -1, 64) +
		`,"width":` + strconv.FormatFloat(area.Width, 'f', -1, 64) +
		`,"height":` + strconv.FormatFloat(area.Height, 'f', -1, 64) +
		`,"blocks":` + strconv.FormatBool(area.Blocks) +
		`,"prop":"` + area.Prop + `","name":"` + area.Name + `","kind":"` + kind + `"}`
	response := testFixture.callAdmin("PUT",
		"/admin/api/lans/1/areas/"+strconv.FormatInt(area.ID, 10), body)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("assign: %d %s", response.status, response.body)
	}
}

const (
	seatsZone = `{"id":"seats","name":"Reihe A","x":10,"y":10,"width":20,"height":20,` +
		`"blocks":false,"prop":""}`
	couchZone = `{"id":"couch","name":"Sofa","x":50.5,"y":10.25,"width":10,"height":5,` +
		`"blocks":true,"prop":"couch"}`
)

func TestImportCreatesZonesWithoutAnAssignment(t *testing.T) {
	testFixture := newFixture(t)
	report := testFixture.importMap(seatsZone + "," + couchZone)
	if len(report.Created) != 2 || len(report.Updated) != 0 || len(report.Removed) != 0 {
		t.Fatalf("report: %+v", report)
	}
	couch := testFixture.findMapArea("couch")
	if couch.Kind != "none" || !couch.Blocks || couch.Prop != "couch" || couch.X != 50.5 {
		t.Fatalf("couch: %+v", couch)
	}
}

func TestImportAgainKeepsAssignmentSeatCodeAndHandMadeZones(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.importMap(seatsZone)
	seats := testFixture.findMapArea("seats")
	testFixture.assignKind(seats, "seats")
	code := testFixture.issueCode(1, strconv.FormatInt(seats.ID, 10), `{}`)
	handMadeID := testFixture.createArea(`{"x":70,"y":70,"width":5,"height":5,"kind":"lounge"}`)

	moved := strings.Replace(seatsZone, `"x":10`, `"x":12`, 1)
	report := testFixture.importMap(moved)
	if len(report.Updated) != 1 || report.Updated[0] != "seats" || len(report.Created) != 0 {
		t.Fatalf("report: %+v", report)
	}
	if got := testFixture.findMapArea("seats"); got.ID != seats.ID || got.Kind != "seats" ||
		got.X != 12 {
		t.Fatalf("seats: %+v", got)
	}
	if again := testFixture.importMap(moved); len(again.Updated) != 0 {
		t.Fatalf("nothing changed, but: %+v", again)
	}
	response := testFixture.redeem(map[string]string{
		"code": code, "name": "Sitzer", "color": "mint",
	})
	if response.status != http.StatusOK || !decodeBody[redeemAnswer](t, response).SeatAssigned {
		t.Fatalf("the seat code has to survive: %d %s", response.status, response.body)
	}
	found := false
	for _, area := range testFixture.loadStage().Areas {
		found = found || strconv.FormatInt(area.ID, 10) == handMadeID
	}
	if !found {
		t.Fatal("zones made by hand are not part of the map")
	}
}

func TestImportRemovesMissingZonesAndReportsWhoLostTheirPlace(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Sitzer")
	playerID := testFixture.loadMe(token).ID
	testFixture.importMap(seatsZone + "," + couchZone)
	seats := testFixture.findMapArea("seats")
	testFixture.assignKind(seats, "seats")
	testFixture.requireAssign(playerID, seats.ID)

	report := testFixture.importMap(couchZone)
	if len(report.Removed) != 1 || report.Removed[0] != "seats" || report.UnassignedPlayers != 1 {
		t.Fatalf("report: %+v", report)
	}
	if area := testFixture.findStageArea(playerID); area != nil {
		t.Fatalf("the jelly still has area %d", *area)
	}
}

// requireAssign puts a jelly into an area.
func (testFixture *fixture) requireAssign(playerID, areaID int64) {
	testFixture.t.Helper()
	response := testFixture.callAdmin("PUT",
		"/admin/api/lans/1/players/"+strconv.FormatInt(playerID, 10)+"/area",
		`{"area_id":`+strconv.FormatInt(areaID, 10)+`}`)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("assign: %d %s", response.status, response.body)
	}
}

func TestImportReportsUnknownPropsAndStillTakesTheZone(t *testing.T) {
	testFixture := newFixture(t)
	report := testFixture.importMap(
		strings.Replace(couchZone, `"prop":"couch"`, `"prop":"yacht"`, 1),
	)
	if len(report.UnknownProps) != 1 || report.UnknownProps[0] != "yacht" ||
		len(report.Created) != 1 {
		t.Fatalf("report: %+v", report)
	}
}

func TestImportRefusesBrokenMapsWithoutChangingAnything(t *testing.T) {
	testFixture := newFixture(t)
	for _, body := range []string{
		`{"version":3,"zones":[]}`,
		`{"version":1,"zones":[` + seatsZone + `,` + seatsZone + `]}`,
		`{"version":1,"zones":[{"id":"far","name":"","x":99,"y":1,"width":5,"height":1,` +
			`"blocks":false,"prop":""}]}`,
	} {
		requireProblem(t, testFixture.callAdmin("PUT", mapPath, body),
			http.StatusBadRequest, "invalid_map")
	}
	requireProblem(t, testFixture.callAdmin("PUT", mapPath, `{"version":1,"kind":"x"}`),
		http.StatusBadRequest, "invalid_request")
	if areas := testFixture.loadStage().Areas; len(areas) != 0 {
		t.Fatalf("areas: %+v", areas)
	}
	response := testFixture.callAdmin("PUT", "/admin/api/lans/99/map",
		`{"version":1,"zones":[`+seatsZone+`]}`)
	requireProblem(t, response, http.StatusNotFound, "lan_not_found")
}

func TestOnlyPublicZonesShowTheirNameOnTheStage(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.importMap(seatsZone + "," + couchZone)
	testFixture.assignKind(testFixture.findMapArea("seats"), "public")
	for _, area := range testFixture.loadStage().Areas {
		isPublic := area.Kind == "public"
		if isPublic != (area.Name != nil) || (isPublic && *area.Name != "Reihe A") {
			t.Fatalf("area: %+v", area)
		}
	}
}

func TestTripsGoEverywhereExceptIntoBlockingZones(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Reisend")
	testFixture.importMap(seatsZone + "," + couchZone)
	testFixture.assignKind(testFixture.findMapArea("seats"), "seats")

	requireProblem(t, testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":55,"y":12}`),
		http.StatusBadRequest, "invalid_trip")
	if got := testFixture.callAPI(
		"POST",
		"/v1/trips/goto",
		token,
		`{"x":20,"y":20}`,
	).status; got != 200 {
		t.Fatalf("a seat of someone else is a valid goal: %d", got)
	}
}

func TestImportTakesARotationAndNoticesWhenItChanges(t *testing.T) {
	testFixture := newFixture(t)
	const table = `{"id":"table","name":"","x":30,"y":45,"width":40,"height":5,"blocks":true,` +
		`"prop":"desk"`
	testFixture.importMap(table + `}`)
	if got := testFixture.findMapArea("table").Rotation; got != 0 {
		t.Fatalf("a zone without rotation stays unturned: %v", got)
	}
	report := testFixture.importMap(table + `,"rotation":37.5}`)
	if len(report.Updated) != 1 || testFixture.findMapArea("table").Rotation != 37.5 {
		t.Fatalf("report: %+v", report)
	}
	if got := testFixture.loadStage().Areas[0].Rotation; got != 37.5 {
		t.Fatalf("the stage shows rotation %v", got)
	}
	requireProblem(t, testFixture.callAdmin("PUT", mapPath,
		`{"version":1,"zones":[`+table+`,"rotation":360}]}`), http.StatusBadRequest, "invalid_map")
	if got := testFixture.findMapArea("table").Rotation; got != 37.5 {
		t.Fatalf("a refused map changed the rotation to %v", got)
	}
}

func TestTripsAreRefusedByTheRotatedShapeOfAZone(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Reisend")
	testFixture.importMap(`{"id":"table","name":"","x":30,"y":45,"width":40,"height":5,` +
		`"rotation":90,"blocks":true,"prop":"desk"}`)

	requireProblem(t, testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":50,"y":57}`),
		http.StatusBadRequest, "invalid_trip")
	response := testFixture.callAPI("POST", "/v1/trips/goto", token, `{"x":65,"y":47.5}`)
	if response.status != http.StatusOK {
		t.Fatalf(
			"where the table would stand unturned is free: %d %s",
			response.status,
			response.body,
		)
	}
}

func TestMapInMetersBecomesPercentOfTheRoomAndTheStageSaysBothWays(t *testing.T) {
	testFixture := newFixture(t)
	const rulesPath = "/admin/api/lans/1/rules"
	if response := testFixture.callAdmin("PATCH", rulesPath,
		`{"room_width":20,"room_depth":10,"jelly_width":0.5}`); response.status != http.StatusOK {
		t.Fatalf("rules: %d %s", response.status, response.body)
	}
	response := testFixture.callAdmin("PUT", mapPath, `{"version":2,"zones":[`+
		`{"id":"desk","name":"","x":5,"y":2,"width":1,"height":0.5,"blocks":true,"prop":"desk"}]}`)
	if response.status != http.StatusOK {
		t.Fatalf("import: %d %s", response.status, response.body)
	}
	desk := testFixture.findMapArea("desk")
	if desk.X != 25 || desk.Y != 20 || desk.Width != 5 || desk.Height != 5 {
		t.Fatalf("percent of a room of 20 by 10 meters: %+v", desk)
	}
	stage := testFixture.loadStage()
	room := stage.Room
	if room.WidthMeters != 20 || room.DepthMeters != 10 || room.JellyMeters != 0.5 {
		t.Fatalf("room: %+v", room)
	}
	area := stage.Areas[0]
	if area.XMeters != 5 || area.YMeters != 2 || area.WidthMeters != 1 || area.HeightMeters != 0.5 {
		t.Fatalf("area in meters: %+v", area)
	}
}

func TestMapInMetersOutsideTheRoomIsRefused(t *testing.T) {
	testFixture := newFixture(t)
	requireProblem(t, testFixture.callAdmin("PUT", mapPath, `{"version":2,"zones":[`+
		`{"id":"far","name":"","x":21.5,"y":1,"width":1,"height":1,"blocks":true,"prop":"desk"}]}`),
		http.StatusBadRequest, "invalid_map")
}
