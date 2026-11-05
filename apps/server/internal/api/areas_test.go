package api_test

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const areasPath = "/admin/api/lans/1/areas"

// createArea adds an area and returns its ID as text.
func (testFixture *fixture) createArea(body string) string {
	testFixture.t.Helper()
	response := testFixture.callAdmin("POST", areasPath, body)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("create area: %d %s", response.status, response.body)
	}
	return strconv.FormatInt(decodeBody[store.StageArea](testFixture.t, response).ID, 10)
}

func TestAreasPlaceJelliesWithoutNames(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	playerID := strconv.FormatInt(testFixture.loadMe(token).ID, 10)

	response := testFixture.callAdmin("POST", areasPath,
		`{"x":0,"y":0,"width":200,"height":10,"kind":"seats"}`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_area")
	testFixture.createArea(`{"x":0,"y":0,"width":50,"height":50,"kind":"seats"}`)
	areaID := testFixture.createArea(`{"x":50,"y":50,"width":50,"height":50,"kind":"seats"}`)

	assignPath := "/admin/api/lans/1/players/" + playerID + "/area"
	response = testFixture.callAdmin("PUT", assignPath, `{"area_id":999}`)
	requireProblem(t, response, http.StatusNotFound, "area_not_found")
	testFixture.callAdmin("PUT", assignPath, `{"area_id":`+areaID+`}`)

	stage := testFixture.loadStage()
	player := stage.Players[0]
	if player.AreaID == nil || strconv.FormatInt(*player.AreaID, 10) != areaID {
		t.Fatalf("area: %+v", player)
	}
	if player.X < 50 || player.X > 100 || player.Y < 50 || player.Y > 100 {
		t.Fatalf("home spot is outside its area: %+v", player)
	}
	if stage.ServerTime != testFixture.clock.Load() || len(stage.Areas) != 2 {
		t.Fatalf("stage: %+v", stage)
	}
}

func TestEditingAreaKeepsAssignments(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	playerID := strconv.FormatInt(testFixture.loadMe(token).ID, 10)
	areaID := testFixture.createArea(`{"x":0,"y":0,"width":50,"height":50,"kind":"seats"}`)
	testFixture.callAdmin("PUT", "/admin/api/lans/1/players/"+playerID+"/area",
		`{"area_id":`+areaID+`}`)

	response := testFixture.callAdmin("PUT", areasPath+"/"+areaID,
		`{"x":50,"y":50,"width":50,"height":50,"kind":"seats"}`)
	if response.status != http.StatusOK {
		t.Fatalf("update area: %d %s", response.status, response.body)
	}
	player := testFixture.loadStage().Players[0]
	if player.AreaID == nil || player.X < 50 {
		t.Fatalf("the jelly must move with its area: %+v", player)
	}

	response = testFixture.callAdmin("PUT", areasPath+"/999",
		`{"x":0,"y":0,"width":5,"height":5,"kind":"seats"}`)
	requireProblem(t, response, http.StatusNotFound, "area_not_found")

	testFixture.callAdmin("DELETE", areasPath+"/"+areaID, "")
	stage := testFixture.loadStage()
	if len(stage.Areas) != 0 || stage.Players[0].AreaID != nil {
		t.Fatalf("deleting an area must clear its jellies: %+v", stage)
	}
}

func TestAreaKindsDecideWhoStandsThere(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	playerID := strconv.FormatInt(testFixture.loadMe(token).ID, 10)
	assignPath := "/admin/api/lans/1/players/" + playerID + "/area"

	response := testFixture.callAdmin("POST", areasPath, `{"x":0,"y":0,"width":10,"height":10}`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_area")
	response = testFixture.callAdmin("POST", areasPath,
		`{"x":0,"y":0,"width":10,"height":10,"kind":"plant"}`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_area")

	deskID := testFixture.createArea(
		`{"x":0,"y":0,"width":40,"height":2,"kind":"none","blocks":true,"prop":"desk"}`,
	)
	response = testFixture.callAdmin("PUT", assignPath, `{"area_id":`+deskID+`}`)
	requireProblem(t, response, http.StatusConflict, "area_not_assignable")

	seatsID := testFixture.createArea(`{"x":0,"y":5,"width":40,"height":20,"kind":"seats"}`)
	testFixture.callAdmin("PUT", assignPath, `{"area_id":`+seatsID+`}`)
	response = testFixture.callAdmin("PUT", areasPath+"/"+seatsID,
		`{"x":0,"y":5,"width":40,"height":20,"kind":"queue"}`)
	if response.status != http.StatusOK {
		t.Fatalf("update area: %d %s", response.status, response.body)
	}

	stage := testFixture.loadStage()
	if stage.Players[0].AreaID != nil {
		t.Fatalf("an area without seats must send its jellies away: %+v", stage.Players[0])
	}
	if len(stage.Areas) != 2 || !stage.Areas[0].Blocks || stage.Areas[0].Prop != "desk" ||
		stage.Areas[1].Kind != "queue" {
		t.Fatalf("the stage must know kinds, props and what blocks: %+v", stage.Areas)
	}
}

func TestStageAndLoungeHoldJelliesTheQueueDoesNot(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	playerID := strconv.FormatInt(testFixture.loadMe(token).ID, 10)
	assignPath := "/admin/api/lans/1/players/" + playerID + "/area"

	barID := testFixture.createArea(`{"x":65,"y":14,"width":20,"height":3,"kind":"queue"}`)
	response := testFixture.callAdmin("PUT", assignPath, `{"area_id":`+barID+`}`)
	requireProblem(t, response, http.StatusConflict, "area_not_assignable")

	stageID := testFixture.createArea(`{"x":5,"y":1,"width":90,"height":8,"kind":"stage"}`)
	response = testFixture.callAdmin("PUT", assignPath, `{"area_id":`+stageID+`}`)
	if response.status != http.StatusOK {
		t.Fatalf("assign to stage: %d %s", response.status, response.body)
	}
	player := testFixture.loadStage().Players[0]
	if player.AreaID == nil || strconv.FormatInt(*player.AreaID, 10) != stageID || player.Y > 9 {
		t.Fatalf("the jelly must stand on the stage: %+v", player)
	}
}

func TestJelliesWithoutAreaChillInTheLounge(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.registerPlayer("A")
	stage := testFixture.loadStage()
	if stage.Players[0].AreaID != nil {
		t.Fatalf("without a lounge a jelly has no area: %+v", stage.Players[0])
	}
	loungeID := testFixture.createArea(`{"x":5,"y":12,"width":40,"height":10,"kind":"lounge"}`)
	testFixture.createArea(`{"x":55,"y":12,"width":40,"height":10,"kind":"lounge"}`)

	player := testFixture.loadStage().Players[0]
	if player.AreaID == nil || strconv.FormatInt(*player.AreaID, 10) != loungeID {
		t.Fatalf("the jelly must chill in the first lounge: %+v", player)
	}
	if player.X < 5 || player.X > 45 || player.Y < 12 || player.Y > 22 {
		t.Fatalf("home spot is outside the lounge: %+v", player)
	}
	response := testFixture.callAdmin("GET", areasPath, "")
	if assigned := findOnlyAssignment(t, response.body); assigned != nil {
		t.Fatalf("the admin must still see no assignment, got area %d", *assigned)
	}
}

// findOnlyAssignment returns the area of the only assignment in an area list response.
func findOnlyAssignment(t *testing.T, body []byte) *int64 {
	t.Helper()
	var list struct {
		Assignments []store.AreaAssignment `json:"assignments"`
	}
	if err := json.Unmarshal(body, &list); err != nil || len(list.Assignments) != 1 {
		t.Fatalf("assignments: %v %s", err, body)
	}
	return list.Assignments[0].AreaID
}

func TestZoneNameStaysWithTheAdmin(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.createArea(
		`{"x":0,"y":0,"width":50,"height":50,"kind":"none","name":"Rechte Ecke"}`,
	)
	response := testFixture.callAdmin("GET", "/admin/api/lans/1/areas", "")
	if !strings.Contains(string(response.body), "Rechte Ecke") {
		t.Fatalf("admin = %s", response.body)
	}
	stage := testFixture.callAPI("GET", "/v1/stage?key="+stageKey, "", "")
	if strings.Contains(string(stage.body), "Rechte Ecke") {
		t.Fatalf("stage = %s", stage.body)
	}
}

func TestPlayerWithoutASeatIsAVisitorInTheVisitorZone(t *testing.T) {
	testFixture := newFixture(t)
	testFixture.registerPlayer("A")
	testFixture.createArea(`{"x":5,"y":12,"width":40,"height":10,"kind":"lounge"}`)
	zoneID := testFixture.createArea(`{"x":5,"y":60,"width":40,"height":20,"kind":"visitors"}`)
	player := testFixture.loadStage().Players[0]
	if !player.IsVisitor || player.AreaID == nil ||
		strconv.FormatInt(*player.AreaID, 10) != zoneID {
		t.Fatalf("player = %+v", player)
	}
}

func TestZoneWithoutAssignmentTakesNoJelly(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	playerID := strconv.FormatInt(testFixture.loadMe(token).ID, 10)
	zoneID := testFixture.createArea(`{"x":0,"y":0,"width":50,"height":50,"kind":"none"}`)
	response := testFixture.callAdmin("PUT", "/admin/api/lans/1/players/"+playerID+"/area",
		`{"area_id":`+zoneID+`}`)
	if response.status == http.StatusOK {
		t.Fatalf("assign: %s", response.body)
	}
}
