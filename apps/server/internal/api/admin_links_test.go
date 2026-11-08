package api_test

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
)

func TestHTTPDemoCookieWorksWithoutHTTPS(t *testing.T) {
	testFixture := newFixture(t)
	handler := api.NewHandler(api.Dependencies{
		Store: testFixture.database, Now: time.Now, Logger: slog.New(slog.DiscardHandler),
		StageKey: stageKey, AdminSecret: adminSecret, IsHTTPDemo: true,
		IsStopping: testFixture.stopping.Load, Web: nil,
	})
	request := httptest.NewRequestWithContext(t.Context(), "POST", "/admin/api/login",
		strings.NewReader(`{"secret":"`+adminSecret+`"}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Secure || !cookies[0].HttpOnly {
		t.Fatalf("demo cookie: %+v", cookies)
	}
}

func TestAdminGetsTheStageLink(t *testing.T) {
	testFixture := newFixture(t)
	response := testFixture.callAdmin("GET", "/admin/api/stage-link", "")
	if response.status != http.StatusOK ||
		!strings.Contains(string(response.body), "/stage/?key="+stageKey) {
		t.Fatalf("stage link: %d %s", response.status, response.body)
	}
}
