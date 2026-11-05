package api

import (
	"net/http"
	"slices"
	"testing"
)

func TestContractDocsReportGapsInBothDirections(t *testing.T) {
	contract := buildContractAPI(http.NewServeMux())
	newAPIServer(Dependencies{}).addContractRoutes(contract)
	gaps := applyContractDocs(contract, contractDocs{
		Operations: map[string]string{"goneRoute": "text", "getMe": "text"},
		Parameters: map[string]string{"goneParameter": "text"},
		Schemas: map[string]schemaDoc{
			"GoneSchema": {Description: "text"},
			"Room":       {Description: "text", Fields: map[string]string{"gone": "text"}},
		},
	})
	for _, want := range []string{
		"described but missing: route goneRoute",
		"described but missing: parameter goneParameter",
		"described but missing: schema GoneSchema",
		"described but missing: field Room.gone",
		"no description: field Room.width",
		"no description: schema Stack",
		"no description: route getCatalog",
		"no description: parameter cursor",
	} {
		if !slices.Contains(gaps, want) {
			t.Errorf("gaps miss %q", want)
		}
	}
}
