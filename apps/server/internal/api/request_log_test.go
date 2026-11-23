package api_test

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
)

// newLoggedHandler builds the handler with a text log from the given level on.
func newLoggedHandler(testFixture *fixture, level slog.Level) (http.Handler, *bytes.Buffer) {
	logs := &bytes.Buffer{}
	handler := api.NewHandler(api.Dependencies{
		Store: testFixture.database, Now: time.Now,
		Logger:   slog.New(slog.NewTextHandler(logs, &slog.HandlerOptions{Level: level})),
		StageKey: stageKey, AdminSecret: adminSecret,
		IsStopping: testFixture.stopping.Load, Web: nil,
	})
	return handler, logs
}

func TestDebugLogNamesRequestsWithoutSecrets(t *testing.T) {
	testFixture := newFixture(t)
	handler, logs := newLoggedHandler(testFixture, slog.LevelDebug)

	stage := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
		"/v1/stage?key="+stageKey, http.NoBody)
	stage.Header.Set("Authorization", "Bearer some-token")
	handler.ServeHTTP(httptest.NewRecorder(), stage)
	login := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/admin/api/login",
		strings.NewReader(`{"secret":"`+adminSecret+`"}`))
	handler.ServeHTTP(httptest.NewRecorder(), login)

	text := logs.String()
	for _, want := range []string{
		`route="GET /v1/stage"`, "path=/v1/stage", "status=200",
		`route="POST /admin/api/login"`,
	} {
		if !strings.Contains(text, want) {
			t.Errorf("log misses %s:\n%s", want, text)
		}
	}
	for _, secret := range []string{stageKey, adminSecret, "some-token"} {
		if strings.Contains(text, secret) {
			t.Errorf("log shows the secret %q:\n%s", secret, text)
		}
	}
}

func TestInfoLogSkipsRequests(t *testing.T) {
	testFixture := newFixture(t)
	handler, logs := newLoggedHandler(testFixture, slog.LevelInfo)
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/health", http.NoBody)
	handler.ServeHTTP(httptest.NewRecorder(), request)
	if strings.Contains(logs.String(), "msg=request") {
		t.Fatalf("info level must not log every request:\n%s", logs)
	}
}
