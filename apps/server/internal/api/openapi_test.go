package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
)

const openAPIFile = "../../docs/openapi.json"

func TestOpenAPIFileMatchesTheCode(t *testing.T) {
	generated, err := api.BuildOpenAPI()
	if err != nil {
		t.Fatal(err)
	}
	stored, err := os.ReadFile(openAPIFile)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(generated, stored) {
		t.Fatalf("%s is out of date, run `pnpm openapi`", openAPIFile)
	}
}

func TestServerServesItsContract(t *testing.T) {
	response := newFixture(t).callAPI("GET", "/v1/openapi.json", "", "")
	if response.status != http.StatusOK {
		t.Fatalf("status %d", response.status)
	}
	var document struct {
		Info struct {
			Version string `json:"version"`
		} `json:"info"`
		Paths map[string]any `json:"paths"`
	}
	err := json.Unmarshal(response.body, &document)
	if err != nil {
		t.Fatal(err)
	}
	if document.Info.Version != api.APIVersion {
		t.Errorf("version = %q", document.Info.Version)
	}
	for _, path := range []string{"/v1/register", "/v1/state", "/v1/events/stream"} {
		if _, found := document.Paths[path]; !found {
			t.Errorf("contract misses %s", path)
		}
	}
	for path := range document.Paths {
		if !strings.HasPrefix(path, "/v1/") {
			t.Errorf("%s is outside the version", path)
		}
	}
}

func TestContractRejectsInvalidRequestsInTheCommonForm(t *testing.T) {
	testFixture := newFixture(t)
	token := testFixture.registerPlayer("A")
	testCases := []struct {
		name, body string
		status     int
	}{
		{"unknown field", `{"action":"poke","xp":999}`, http.StatusUnprocessableEntity},
		{"missing field", `{}`, http.StatusUnprocessableEntity},
		{"no JSON", `poke`, http.StatusBadRequest},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			response := testFixture.callAPI("POST", "/v1/actions", token, testCase.body)
			requireProblem(t, response, testCase.status, "invalid_body")
		})
	}
}

func TestOtherContentTypesAreRejected(t *testing.T) {
	testFixture := newFixture(t)
	request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/v1/register",
		strings.NewReader(buildRegisterBody("A", "mint")))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	recorder := httptest.NewRecorder()
	testFixture.handler.ServeHTTP(recorder, request)
	requireProblem(t, apiResponse{status: recorder.Code, body: recorder.Body.Bytes()},
		http.StatusUnsupportedMediaType, "invalid_body")
}

func TestOldPathsAreGone(t *testing.T) {
	response := newFixture(t).callAPI("POST", "/register", "", `{}`)
	if response.status != http.StatusNotFound && response.status != http.StatusMethodNotAllowed {
		t.Fatalf("status %d", response.status)
	}
}
