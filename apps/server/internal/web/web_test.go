package web_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/web"
)

func TestServesPagesWithSecurityHeaders(t *testing.T) {
	handler := web.NewFileHandler(fstest.MapFS{
		"stage/index.html": {Data: []byte("<title>Stage</title>")},
		"stage/main.js":    {Data: []byte("run()")},
		".gitkeep":         {Data: []byte{}},
	})

	response := request(t, handler, "/stage/")
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "Stage") {
		t.Fatalf("page: status %d, body %q", response.Code, response.Body.String())
	}
	policy := response.Header().Get("Content-Security-Policy")
	if !strings.Contains(policy, "script-src 'self'") {
		t.Errorf("policy %q does not limit scripts", policy)
	}
	if response.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Error("the stage key could leak through the referrer")
	}
	if script := request(t, handler, "/stage/main.js"); script.Code != http.StatusOK {
		t.Errorf("script: status %d", script.Code)
	}
}

func TestHidesEverythingOutsideThePages(t *testing.T) {
	handler := web.NewFileHandler(fstest.MapFS{
		"stage/index.html": {Data: []byte("page")},
		".gitkeep":         {Data: []byte{}},
	})
	for _, path := range []string{"/", "/.gitkeep", "/unknown"} {
		if response := request(t, handler, path); response.Code != http.StatusNotFound {
			t.Errorf("%s: status %d, want 404", path, response.Code)
		}
	}
}

func TestEmbeddedHandlerStartsWithoutABuild(t *testing.T) {
	if _, err := web.NewHandler(); err != nil {
		t.Fatal(err)
	}
}

func request(t *testing.T, handler http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	page := httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, http.NoBody)
	handler.ServeHTTP(recorder, page)
	return recorder
}
