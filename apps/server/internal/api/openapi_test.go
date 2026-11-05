package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"

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

func TestOpenAPIFileIsValid(t *testing.T) {
	document, err := openapi3.NewLoader().LoadFromFile(openAPIFile)
	if err != nil {
		t.Fatal(err)
	}
	err = document.Validate(t.Context())
	if err != nil {
		t.Fatal(err)
	}
}

func TestServerServesTheStoredFile(t *testing.T) {
	stored, err := os.ReadFile(openAPIFile)
	if err != nil {
		t.Fatal(err)
	}
	response := newFixture(t).callAPI("GET", "/v1/openapi-3.0.json", "", "")
	var served, want any
	if err = json.Unmarshal(response.body, &served); err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(stored, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(served, want) {
		t.Fatal("the server serves a different contract than docs/openapi.json")
	}
}

func TestContractAllowsResponsesToGrowAndNullsWhereTheyHappen(t *testing.T) {
	generated, err := api.BuildOpenAPI()
	if err != nil {
		t.Fatal(err)
	}
	document, err := openapi3.NewLoader().LoadFromData(generated)
	if err != nil {
		t.Fatal(err)
	}
	schemas := document.Components.Schemas
	state := schemas["PlayerState"].Value
	if state.AdditionalProperties.Has != nil && !*state.AdditionalProperties.Has {
		t.Error("responses must accept new fields")
	}
	if !state.Properties["reports"].Value.Nullable || !state.Properties["lan"].Value.Nullable {
		t.Error("`reports` and `lan` are null outside a LAN")
	}
	if state.Properties["badges"].Value.Nullable {
		t.Error("lists are empty rather than null")
	}
	body := schemas["RedeemBody"].Value
	if body.AdditionalProperties.Has == nil || *body.AdditionalProperties.Has {
		t.Error("requests must reject unknown fields")
	}
}

func TestContractDescribesEveryRouteFieldAndParameter(t *testing.T) {
	generated, err := api.BuildOpenAPI()
	if err != nil {
		t.Fatal(err)
	}
	document, err := openapi3.NewLoader().LoadFromData(generated)
	if err != nil {
		t.Fatal(err)
	}
	for path, item := range document.Paths.Map() {
		for method, operation := range item.Operations() {
			if operation.Description == "" {
				t.Errorf("%s %s has no description", method, path)
			}
			for _, parameter := range operation.Parameters {
				if parameter.Value.Description == "" {
					t.Errorf("%s %s: %s has no description", method, path, parameter.Value.Name)
				}
			}
		}
	}
	for name, schema := range document.Components.Schemas {
		if schema.Value.Description == "" {
			t.Errorf("schema %s has no description", name)
		}
		for field, property := range schema.Value.Properties {
			if property.Value.Description == "" {
				t.Errorf("%s.%s has no description", name, field)
			}
		}
	}
}

func TestContractListsEveryEventAndError(t *testing.T) {
	generated, err := api.BuildOpenAPI()
	if err != nil {
		t.Fatal(err)
	}
	document, err := openapi3.NewLoader().LoadFromData(generated)
	if err != nil {
		t.Fatal(err)
	}
	stream := document.Paths.Find("/v1/stage/events").Get.Description
	source, err := os.ReadFile("../store/events.go")
	if err != nil {
		t.Fatal(err)
	}
	eventTypes := regexp.MustCompile(`(?m)^\s+Event\w+\s*=\s*"([^"]+)"`).FindAllSubmatch(source, -1)
	if len(eventTypes) == 0 {
		t.Fatal("found no event types in store/events.go")
	}
	for _, eventType := range eventTypes {
		if !strings.Contains(stream, "`"+string(eventType[1])+"`") {
			t.Errorf("the stream route does not list %s", eventType[1])
		}
	}
	codes := []string{"invalid_body", "too_far", "name_taken", "internal", "not_found"}
	for _, code := range codes {
		if !strings.Contains(document.Info.Description, "`"+code+"`") {
			t.Errorf("the overview does not list %s", code)
		}
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
	for _, path := range []string{"/v1/auth/redeem", "/v1/stage", "/v1/stage/events"} {
		if _, found := document.Paths[path]; !found {
			t.Errorf("contract misses %s", path)
		}
	}
	for path := range document.Paths {
		// The version route outlives every path version on purpose.
		if !strings.HasPrefix(path, "/v1/") && path != "/version" {
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
		{"unknown field", `{"kind":"food","xp":999}`, http.StatusUnprocessableEntity},
		{"missing field", `{}`, http.StatusUnprocessableEntity},
		{"no JSON", `poke`, http.StatusBadRequest},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			response := testFixture.callAPI("POST", "/v1/reports", token, testCase.body)
			requireProblem(t, response, testCase.status, "invalid_body")
		})
	}
}

func TestOtherContentTypesAreRejected(t *testing.T) {
	testFixture := newFixture(t)
	request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/v1/auth/redeem",
		strings.NewReader(buildRegisterBody("A", "mint")))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	recorder := httptest.NewRecorder()
	testFixture.handler.ServeHTTP(recorder, request)
	requireProblem(t, apiResponse{status: recorder.Code, body: recorder.Body.Bytes()},
		http.StatusUnsupportedMediaType, "invalid_body")
}

func TestUnknownPathsAnswerInTheCommonForm(t *testing.T) {
	testFixture := newFixture(t)
	for _, call := range [][2]string{
		{"GET", "/v1/nope"}, {"POST", "/v1/nope"}, {"GET", "/v1/pokes"}, {"PUT", "/v1/players/me"},
	} {
		response := testFixture.callAPI(call[0], call[1], "", "")
		requireProblem(t, response, http.StatusNotFound, "not_found")
	}
}
