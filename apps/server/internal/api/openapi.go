package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"slices"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
)

const (
	// APIVersion is the version of `/v1`. Every new feature raises it, see `docs/api.md`.
	APIVersion = "1.4.0"
	apiTitle   = "Jelly API"
	// versionPrefix only changes for a breaking change, which then lives next to the old one.
	versionPrefix = "/v1"
	openAPIPath   = versionPrefix + "/openapi"

	headerAuthorization = "Authorization"
	securityBearer      = "bearer"
	securityStageKey    = "stage_key"
	queryStageKey       = "key"
	contentTypeJSON     = "application/json"
	responseDefault     = "default"
	// Request types end like this. All other schemas describe responses.
	requestSchemaSuffix = "Body"
)

// jsonOutput is a response with a JSON body.
type jsonOutput[Body any] struct {
	Body Body
}

// jsonInput is a request with a JSON body.
type jsonInput[Body any] struct {
	Body Body
}

// noInput is a request without parameters or body.
type noInput struct{}

// contextKey names the values that middlewares hand to handlers.
type contextKey int

const contextPlayerID contextKey = iota

// buildContractAPI creates the documented API on `mux`. Validation errors of the library get the
// same form as our own errors, without changing its global settings.
//
//nolint:ireturn // The library only hands out this interface.
func buildContractAPI(mux *http.ServeMux) huma.API {
	config := huma.DefaultConfig(apiTitle, APIVersion)
	config.OpenAPIPath = openAPIPath
	config.DocsPath = ""
	config.SchemasPath = ""
	config.CreateHooks = nil
	config.Transformers = []huma.Transformer{translateLibraryError}
	config.Components.SecuritySchemes = map[string]*huma.SecurityScheme{
		securityBearer:   {Type: "http", Scheme: "bearer"},
		securityStageKey: {Type: "apiKey", In: paramInQuery, Name: queryStageKey},
	}
	return humago.New(mux, config)
}

// translateLibraryError gives a rejected request our error form.
//
//nolint:ireturn // The signature is given by huma.Transformer.
func translateLibraryError(ctx huma.Context, _ string, value any) (any, error) {
	if _, isLibraryError := value.(*huma.ErrorModel); !isLibraryError {
		return value, nil
	}
	ctx.SetHeader("Content-Type", contentTypeJSON)
	return problemInvalidBody().toResponse(), nil
}

// addOperation registers a documented route under the version.
func addOperation[Input, Output any](
	server *apiServer,
	contract huma.API,
	operation huma.Operation,
	handler func(context.Context, *Input) (*Output, error),
) {
	operation.Path = versionPrefix + operation.Path
	addRootOperation(server, contract, operation, handler)
}

// addRootOperation registers a documented route as it is, for what must outlive the version.
// Handlers return plain errors, which are translated here, so every route answers the same way.
func addRootOperation[Input, Output any](
	server *apiServer,
	contract huma.API,
	operation huma.Operation,
	handler func(context.Context, *Input) (*Output, error),
) {
	operation.MaxBodyBytes = maxBodyBytes
	operation.Responses = map[string]*huma.Response{responseDefault: buildErrorResponse(contract)}
	huma.Register(contract, operation,
		func(ctx context.Context, input *Input) (*Output, error) {
			output, err := handler(ctx, input)
			if err != nil {
				return nil, server.translateError(ctx, operation.OperationID, err).toResponse()
			}
			return output, nil
		})
}

// buildErrorResponse documents the uniform error form.
func buildErrorResponse(contract huma.API) *huma.Response {
	schema := contract.OpenAPI().Components.Schemas.Schema(
		reflect.TypeFor[ErrorResponse](), true, "",
	)
	return &huma.Response{
		Description: "Error with a stable code",
		Content:     map[string]*huma.MediaType{contentTypeJSON: {Schema: schema}},
	}
}

// addPlayerOperation registers a route for a logged-in player.
func addPlayerOperation[Input, Output any](
	server *apiServer,
	contract huma.API,
	operation huma.Operation,
	handler func(context.Context, int64, *Input) (*Output, error),
) {
	operation.Security = []map[string][]string{{securityBearer: {}}}
	// The token comes first, so that limits count per player and strangers cannot use them up.
	operation.Middlewares = append(huma.Middlewares{server.authenticatePlayer},
		operation.Middlewares...)
	addOperation(server, contract, operation,
		func(ctx context.Context, input *Input) (*Output, error) {
			return handler(ctx, readPlayerID(ctx), input)
		})
}

// readPlayerID returns the player that `authenticatePlayer` verified.
func readPlayerID(ctx context.Context) int64 {
	playerID, ok := ctx.Value(contextPlayerID).(int64)
	if !ok {
		return noViewerPlayer
	}
	return playerID
}

// authenticatePlayer verifies the bearer token before the handler runs.
func (server *apiServer) authenticatePlayer(ctx huma.Context, next func(huma.Context)) {
	playerID, err := server.findPlayer(ctx.Context(), ctx.Header(headerAuthorization))
	if err != nil {
		answer := server.translateError(ctx.Context(), ctx.Operation().OperationID, err)
		server.writeContractProblem(ctx, answer)
		return
	}
	if !server.playerRequests.allowAttempt(playerID) {
		server.writeContractProblem(ctx, problemRateLimited())
		return
	}
	next(huma.WithValue(ctx, contextPlayerID, playerID))
}

// identifyPlayer verifies a token if there is one, for routes that also work without an account.
func (server *apiServer) identifyPlayer(ctx huma.Context, next func(huma.Context)) {
	if ctx.Header(headerAuthorization) == "" {
		next(ctx)
		return
	}
	server.authenticatePlayer(ctx, next)
}

// authenticateViewer accepts the stage key from the link or a player token.
func (server *apiServer) authenticateViewer(ctx huma.Context, next func(huma.Context)) {
	if matchSecret(server.StageKey, ctx.Query(queryStageKey)) {
		next(ctx)
		return
	}
	server.authenticatePlayer(ctx, func(authenticated huma.Context) {
		operationCtx := authenticated.Context()
		err := server.Store.RequireCurrentEntry(
			operationCtx, readPlayerID(operationCtx), server.currentMillis(),
		)
		if err != nil {
			answer := server.translateError(operationCtx, ctx.Operation().OperationID, err)
			server.writeContractProblem(authenticated, answer)
			return
		}
		next(authenticated)
	})
}

// limitRegistrations protects registration, where no player is known yet.
func (server *apiServer) limitRegistrations(ctx huma.Context, next func(huma.Context)) {
	if !server.registrations.Allow() {
		server.writeContractProblem(ctx, problemRateLimited())
		return
	}
	next(ctx)
}

// limitCodeAttempts stops one player from guessing codes. It runs after the player is known.
func (server *apiServer) limitCodeAttempts(ctx huma.Context, next func(huma.Context)) {
	if !server.codeAttempts.allowAttempt(readPlayerID(ctx.Context())) {
		server.writeContractProblem(ctx, problemRateLimited())
		return
	}
	next(ctx)
}

// writeContractProblem answers from a middleware, where no handler can return an error.
func (server *apiServer) writeContractProblem(ctx huma.Context, answer problem) {
	ctx.SetHeader("Content-Type", contentTypeJSON)
	ctx.SetStatus(answer.status)
	err := json.NewEncoder(ctx.BodyWriter()).Encode(answer.toResponse())
	if err != nil {
		server.Logger.DebugContext(ctx.Context(), "write error response failed", "error", err)
	}
}

// finishContract corrects what the library derives from Go types. It runs after all routes exist.
func finishContract(contract huma.API) {
	for name, schema := range contract.OpenAPI().Components.Schemas.Map() {
		if strings.HasSuffix(name, requestSchemaSuffix) {
			continue
		}
		// Responses may gain fields in any version, so generated clients must accept unknown ones.
		schema.AdditionalProperties = true
		for field, property := range schema.Properties {
			if property.Type == huma.TypeArray {
				// Lists are empty rather than null.
				property.Nullable = false
			}
			if property.Ref != "" && slices.Contains(listNullableFields(), name+"."+field) {
				schema.Properties[field] = &huma.Schema{
					Type: huma.TypeObject, Nullable: true,
					AllOf: []*huma.Schema{{Ref: property.Ref}},
				}
			}
		}
	}
}

// listNullableFields names the object fields that can be null. Go tags cannot express this.
func listNullableFields() []string {
	return []string{
		"PlayerState.lan", "PlayerState.reports", "LANStatus.current", "LANStatus.next",
	}
}

// BuildOpenAPI returns the contract in OpenAPI 3.0, which most client generators read.
func BuildOpenAPI() ([]byte, error) {
	server := newAPIServer(Dependencies{})
	contract := buildContractAPI(http.NewServeMux())
	server.addContractRoutes(contract)
	finishContract(contract)
	document, err := contract.OpenAPI().Downgrade()
	if err != nil {
		return nil, fmt.Errorf("build OpenAPI document: %w", err)
	}
	var indented bytes.Buffer
	err = json.Indent(&indented, document, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("format OpenAPI document: %w", err)
	}
	indented.WriteByte('\n')
	return indented.Bytes(), nil
}
