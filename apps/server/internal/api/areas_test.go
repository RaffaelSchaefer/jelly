package api_test

import (
	"net/http"
	"strconv"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

func TestAreasPlaceJelliesWithoutNames(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	playerID := strconv.FormatInt(testFixture.loadMe(token).ID, 10)

	response := testFixture.callAdmin("PUT", "/admin/api/lans/1/areas",
		`[{"x":0,"y":0,"width":200,"height":10}]`)
	requireProblem(t, response, http.StatusBadRequest, "invalid_area")
	response = testFixture.callAdmin("PUT", "/admin/api/lans/1/areas",
		`[{"x":0,"y":0,"width":50,"height":50},{"x":50,"y":50,"width":50,"height":50}]`)
	areas := decodeBody[[]store.StageArea](t, response)
	if len(areas) != 2 {
		t.Fatalf("areas: %s", response.body)
	}

	assignPath := "/admin/api/lans/1/players/" + playerID + "/area"
	response = testFixture.callAdmin("PUT", assignPath, `{"area_id":999}`)
	requireProblem(t, response, http.StatusNotFound, "area_not_found")
	areaID := strconv.FormatInt(areas[1].ID, 10)
	testFixture.callAdmin("PUT", assignPath, `{"area_id":`+areaID+`}`)

	stage := testFixture.loadStage()
	player := stage.Players[0]
	if player.AreaID == nil || *player.AreaID != areas[1].ID {
		t.Fatalf("area: %+v", player)
	}
	if player.X < 50 || player.X > 100 || player.Y < 50 || player.Y > 100 {
		t.Fatalf("home spot is outside its area: %+v", player)
	}
	if stage.ServerTime != testFixture.clock.Load() || len(stage.Areas) != 2 {
		t.Fatalf("stage: %+v", stage)
	}

	testFixture.callAdmin("PUT", "/admin/api/lans/1/areas", `[]`)
	if testFixture.loadStage().Players[0].AreaID != nil {
		t.Fatal("replacing the map must clear assignments")
	}
}
