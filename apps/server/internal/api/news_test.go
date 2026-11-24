package api_test

import (
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// planNews puts one news point into the program, starting `after` from now.
func (testFixture *fixture) planNews(after time.Duration, endsAt string) int64 {
	testFixture.t.Helper()
	startsAt := testFixture.clock.Load() + after.Milliseconds()
	tournament := strconv.FormatInt(startsAt+time.Hour.Milliseconds(), 10)
	response := testFixture.callAdmin("PUT", schedulePath, `{"items":[`+
		`{"starts_at":`+strconv.FormatInt(startsAt, 10)+`,"ends_at":`+endsAt+
		`,"title":"News","detail":null,"kind":"news"},`+
		`{"starts_at":`+tournament+`,"ends_at":null,"title":"Turnier","detail":null,`+
		`"kind":"tournament"}]}`)
	if response.status != http.StatusOK {
		testFixture.t.Fatalf("schedule: %d %s", response.status, response.body)
	}
	return startsAt
}

func TestScheduledNewsPresentTheLastHour(t *testing.T) {
	testFixture := newFixture(t)
	earner := testFixture.registerPlayer("Fleißig")
	other := testFixture.registerPlayer("Vorleser")
	earnerID := testFixture.loadMe(earner).ID
	otherID := testFixture.loadMe(other).ID
	testFixture.createArea(`{"x":45,"y":5,"width":10,"height":10,"kind":"winner"}`)
	testFixture.createArea(`{"x":10,"y":70,"width":80,"height":20,"kind":"spectators"}`)
	testFixture.pokePlayer(earner)
	startsAt := testFixture.planNews(time.Minute, "null")
	if stage := testFixture.readStage(other); stage.Gathering != nil {
		t.Fatalf("news before their time: %+v", stage.Gathering)
	}

	testFixture.advanceClock(2 * time.Minute)
	// The stage answers with what was before its tick, which started the news.
	testFixture.readStage(other)
	gathering := testFixture.readStage(other).Gathering
	if gathering == nil || gathering.Kind != store.GatheringNews || gathering.News == nil {
		t.Fatalf("gathering = %+v", gathering)
	}
	news := gathering.News
	if news.TopXP == nil || news.TopXP.PlayerID != earnerID || news.NextItem == nil ||
		news.NextItem.Title != "Turnier" {
		t.Fatalf("news = %+v", news)
	}
	if gathering.PresenterID == nil || *gathering.PresenterID != otherID ||
		gathering.WinnerID != nil {
		t.Fatalf("the jelly not in the news presents them: %+v", gathering)
	}
	if gathering.EndsAt != startsAt+90_000 {
		t.Fatalf("ends_at = %d, want news_seconds after the start", gathering.EndsAt)
	}
	if kind := testFixture.findMoveOf(other, otherID).Kind; kind != movement.KindNews {
		t.Fatalf("presenter walks as %s", kind)
	}

	testFixture.advanceClock(2 * time.Minute)
	testFixture.readStage(other)
	if stage := testFixture.readStage(other); stage.Gathering != nil {
		t.Fatalf("the same point started the news again: %+v", stage.Gathering)
	}
}

func TestNewsWaitForAnotherGathering(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Hungrig")
	testFixture.pokePlayer(token)
	endsAt := strconv.FormatInt(testFixture.clock.Load()+10*time.Minute.Milliseconds(), 10)
	testFixture.planNews(time.Minute, endsAt)
	response := testFixture.callAdmin("POST", gatheringPath, `{"kind":"food","seconds":180}`)
	if response.status != http.StatusOK {
		t.Fatalf("food: %d %s", response.status, response.body)
	}

	testFixture.advanceClock(2 * time.Minute)
	testFixture.readStage(token)
	if gathering := testFixture.readStage(token).Gathering; gathering.Kind != store.GatheringFood {
		t.Fatalf("news must not cut the food short: %+v", gathering)
	}
	testFixture.advanceClock(2 * time.Minute)
	testFixture.readStage(token)
	gathering := testFixture.readStage(token).Gathering
	if gathering == nil || gathering.Kind != store.GatheringNews {
		t.Fatalf("news after the food: %+v", gathering)
	}
}

func TestOrgaStartsNewsByHand(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("Allein")
	testFixture.readStage(token)

	response := testFixture.callAdmin("POST", gatheringPath, `{"kind":"news","seconds":60}`)
	if response.status != http.StatusOK {
		t.Fatalf("news: %d %s", response.status, response.body)
	}
	gathering := testFixture.readStage(token).Gathering
	if gathering == nil || gathering.Kind != store.GatheringNews || gathering.News == nil ||
		gathering.PresenterID == nil {
		t.Fatalf("gathering = %+v", gathering)
	}
	requireProblem(t,
		testFixture.callAdmin("POST", gatheringPath, `{"kind":"news","seconds":60,"winner_id":1}`),
		http.StatusBadRequest, "invalid_request")
}
