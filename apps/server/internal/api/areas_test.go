package api_test

import (
	"net/http"
	"strconv"
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

	response := testFixture.callAdmin("POST", areasPath, `{"x":0,"y":0,"width":200,"height":10}`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_area")
	testFixture.createArea(`{"x":0,"y":0,"width":50,"height":50}`)
	areaID := testFixture.createArea(`{"x":50,"y":50,"width":50,"height":50}`)

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
	areaID := testFixture.createArea(`{"x":0,"y":0,"width":50,"height":50}`)
	testFixture.callAdmin("PUT", "/admin/api/lans/1/players/"+playerID+"/area",
		`{"area_id":`+areaID+`}`)

	response := testFixture.callAdmin("PUT", areasPath+"/"+areaID,
		`{"x":50,"y":50,"width":50,"height":50}`)
	if response.status != http.StatusOK {
		t.Fatalf("update area: %d %s", response.status, response.body)
	}
	player := testFixture.loadStage().Players[0]
	if player.AreaID == nil || player.X < 50 {
		t.Fatalf("the jelly must move with its area: %+v", player)
	}

	response = testFixture.callAdmin("PUT", areasPath+"/999", `{"x":0,"y":0,"width":5,"height":5}`)
	requireProblem(t, response, http.StatusNotFound, "area_not_found")

	testFixture.callAdmin("DELETE", areasPath+"/"+areaID, "")
	stage := testFixture.loadStage()
	if len(stage.Areas) != 0 || stage.Players[0].AreaID != nil {
		t.Fatalf("deleting an area must clear its jellies: %+v", stage)
	}
}
