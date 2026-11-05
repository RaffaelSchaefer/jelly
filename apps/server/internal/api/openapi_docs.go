package api

import (
	_ "embed" // Holds the descriptions of the contract.
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/danielgtaylor/huma/v2"
)

// operationStream is the route whose description lists all messages of the stream.
const operationStream = "streamEvents"

// Kinds of things in the contract that need a description.
const (
	docKindRoute     = "route"
	docKindParameter = "parameter"
	docKindSchema    = "schema"
	docKindField     = "field"
)

// errContractDocs reports that the descriptions do not match the routes and types.
var errContractDocs = errors.New("contract docs do not match the code")

// contractDocsFile holds the texts of the contract. Struct tags cannot wrap, and the descriptions
// that clients need are longer than a code line may be.
//
//go:embed contract_docs.json
var contractDocsFile []byte

// contractDocs is what clients read about the contract besides names and types.
type contractDocs struct {
	Overview   string               `json:"overview"`
	Operations map[string]string    `json:"operations"`
	Parameters map[string]string    `json:"parameters"`
	Schemas    map[string]schemaDoc `json:"schemas"`
	Events     []eventDoc           `json:"events"`
}

// schemaDoc describes one schema and all of its fields.
type schemaDoc struct {
	Description string            `json:"description"`
	Fields      map[string]string `json:"fields"`
}

// eventDoc describes one message of the stream.
type eventDoc struct {
	Type    string `json:"type"`
	Meaning string `json:"meaning"`
	Player  string `json:"player"`
	Payload string `json:"payload"`
}

// describeContract adds the texts to the contract and returns what does not fit: everything
// without a description and every description of something that no longer exists.
func describeContract(contract huma.API) []string {
	var docs contractDocs
	err := json.Unmarshal(contractDocsFile, &docs)
	if err != nil {
		return []string{fmt.Sprintf("read contract docs: %v", err)}
	}
	return applyContractDocs(contract, docs)
}

// applyContractDocs writes the texts into the contract and returns the sorted gaps.
func applyContractDocs(contract huma.API, docs contractDocs) []string {
	document := contract.OpenAPI()
	document.Info.Description = docs.Overview + "\n\n" + buildErrorTable()
	gaps := slices.Concat(
		describeOperations(document, docs), describeSchemas(document, docs.Schemas),
	)
	slices.Sort(gaps)
	return gaps
}

// describeOperations adds the texts of routes and parameters.
func describeOperations(document *huma.OpenAPI, docs contractDocs) []string {
	var gaps []string
	usedOperations := map[string]bool{}
	usedParameters := map[string]bool{}
	for _, item := range document.Paths {
		for _, operation := range listPathOperations(item) {
			usedOperations[operation.OperationID] = true
			gaps = append(gaps, describeOperation(operation, docs)...)
			for _, parameter := range operation.Parameters {
				usedParameters[parameter.Name] = true
				parameter.Description = docs.Parameters[parameter.Name]
				if parameter.Description == "" {
					gaps = append(gaps, reportMissingText(docKindParameter, parameter.Name))
				}
			}
		}
	}
	gaps = append(gaps, listUnusedKeys(docKindRoute, docs.Operations, usedOperations)...)
	return append(gaps, listUnusedKeys(docKindParameter, docs.Parameters, usedParameters)...)
}

// describeOperation adds the text of one route. A text can stand next to the route or in the file.
func describeOperation(operation *huma.Operation, docs contractDocs) []string {
	var gaps []string
	text, found := docs.Operations[operation.OperationID]
	switch {
	case found && operation.Description != "":
		gaps = append(gaps, "described twice: "+docKindRoute+" "+operation.OperationID)
	case found:
		operation.Description = text
	case operation.Description == "":
		gaps = append(gaps, reportMissingText(docKindRoute, operation.OperationID))
	}
	if operation.OperationID == operationStream {
		operation.Description += "\n\n" + buildEventTable(docs.Events)
	}
	return gaps
}

// listPathOperations returns the routes of one path.
func listPathOperations(item *huma.PathItem) []*huma.Operation {
	all := []*huma.Operation{item.Get, item.Post, item.Put, item.Patch, item.Delete}
	return slices.DeleteFunc(all, func(operation *huma.Operation) bool {
		return operation == nil
	})
}

// describeSchemas adds the texts of schemas and their fields.
func describeSchemas(document *huma.OpenAPI, docs map[string]schemaDoc) []string {
	var gaps []string
	schemas := document.Components.Schemas.Map()
	for name, schema := range schemas {
		if !slices.Contains(listLibrarySchemas(), name) {
			gaps = append(gaps, describeSchema(name, schema, docs[name])...)
		}
	}
	for name := range docs {
		if _, exists := schemas[name]; !exists {
			gaps = append(gaps, reportUnusedText(docKindSchema, name))
		}
	}
	return gaps
}

// listLibrarySchemas names what the library registers by itself. It never reaches the document.
func listLibrarySchemas() []string {
	return []string{"ErrorModel", "ErrorDetail"}
}

// describeSchema adds the texts of one schema.
func describeSchema(name string, schema *huma.Schema, doc schemaDoc) []string {
	var gaps []string
	schema.Description = doc.Description
	if doc.Description == "" {
		gaps = append(gaps, reportMissingText(docKindSchema, name))
	}
	for field, property := range schema.Properties {
		text, isDescribed := doc.Fields[field]
		if !isDescribed {
			gaps = append(gaps, reportMissingText(docKindField, name+"."+field))
		}
		schema.Properties[field] = describeProperty(property, text)
	}
	for field := range doc.Fields {
		if _, exists := schema.Properties[field]; !exists {
			gaps = append(gaps, reportUnusedText(docKindField, name+"."+field))
		}
	}
	return gaps
}

// describeProperty adds the text to a field. Next to a `$ref`, tools ignore a description, so that
// field gets wrapped.
func describeProperty(property *huma.Schema, text string) *huma.Schema {
	if property.Ref == "" {
		property.Description = text
		return property
	}
	return &huma.Schema{Description: text, AllOf: []*huma.Schema{{Ref: property.Ref}}}
}

// listUnusedKeys names the texts of things that no longer exist.
func listUnusedKeys(kind string, texts map[string]string, used map[string]bool) []string {
	var gaps []string
	for key := range texts {
		if !used[key] {
			gaps = append(gaps, reportUnusedText(kind, key))
		}
	}
	return gaps
}

// reportMissingText names something without a description.
func reportMissingText(kind, name string) string {
	return "no description: " + kind + " " + name
}

// reportUnusedText names a description of something that does not exist.
func reportUnusedText(kind, name string) string {
	return "described but missing: " + kind + " " + name
}

// buildErrorTable lists all error codes, so that they are part of the contract.
func buildErrorTable() string {
	var table strings.Builder
	table.WriteString("**Error codes:** New ones can appear in any version.\n\n")
	table.WriteString("| Status | Code | Message |\n| --- | --- | --- |\n")
	seen := map[string]bool{}
	for _, answer := range listDocumentedProblems() {
		if seen[answer.code] {
			continue
		}
		seen[answer.code] = true
		fmt.Fprintf(&table, "| %d | `%s` | %s |\n", answer.status, answer.code, answer.message)
	}
	return table.String()
}

// listDocumentedProblems returns every error answer of the contract.
func listDocumentedProblems() []problem {
	problems := []problem{
		problemInvalidBody(), problemNotFound(), problemRateLimited(), problemInternal(),
	}
	for _, known := range listKnownErrors() {
		problems = append(problems, known.answer)
	}
	return problems
}

// buildEventTable lists all messages of the stream, so that they are part of the contract.
func buildEventTable(events []eventDoc) string {
	var table strings.Builder
	table.WriteString("**Messages:** The SSE message type equals `type`.\n\n")
	table.WriteString("| Type | Meaning | `player_id` | `payload` |\n| --- | --- | --- | --- |\n")
	for _, event := range events {
		fmt.Fprintf(&table, "| `%s` | %s | %s | %s |\n",
			event.Type, event.Meaning, event.Player, event.Payload)
	}
	return table.String()
}
