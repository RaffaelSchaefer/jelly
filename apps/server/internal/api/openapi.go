package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
)

const (
	// APIVersion is the version of `/v1`. Every new feature raises it, see `docs/api.md`.
	APIVersion = "1.0.0"
	apiTitle   = "Jelly API"
	// versionPrefix only changes for a breaking change, which then lives next to the old one.
	versionPrefix = "/v1"
	openAPIPath   = versionPrefix + "/openapi"

	securityBearer   = "bearer"
	securityStageKey = "stage_key"
	queryStageKey    = "key"
	contentTypeJSON  = "application/json"
	responseDefault  = "default"
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
		securityStageKey: {Type: "apiKey", In: "query", Name: queryStageKey},
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

// addOperation registers a documented route. Handlers return plain errors, which are translated
// here, so every route answers the same way.
func addOperation[Input, Output any](
	server *apiServer,
	contract huma.API,
	operation huma.Operation,
	handler func(context.Context, *Input) (*Output, error),
) {
	operation.Path = versionPrefix + operation.Path
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
		reflect.TypeFor[responseError](), true, "Error",
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
	operation.Middlewares = append(operation.Middlewares, server.authenticatePlayer)
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
	playerID, err := server.findPlayer(ctx.Context(), ctx.Header("Authorization"))
	if err != nil {
		answer := server.translateError(ctx.Context(), ctx.Operation().OperationID, err)
		server.writeContractProblem(ctx, answer)
		return
	}
	next(huma.WithValue(ctx, contextPlayerID, playerID))
}

// authenticateViewer accepts the stage key from the link or a player token.
func (server *apiServer) authenticateViewer(ctx huma.Context, next func(huma.Context)) {
	if matchSecret(server.StageKey, ctx.Query(queryStageKey)) {
		next(ctx)
		return
	}
	server.authenticatePlayer(ctx, next)
}

// limitContractAttempts protects routes that check guessable codes.
func (server *apiServer) limitContractAttempts(ctx huma.Context, next func(huma.Context)) {
	if !server.attempts.Allow() {
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

// BuildOpenAPI returns the contract in OpenAPI 3.0, which most client generators read.
func BuildOpenAPI() ([]byte, error) {
	server := newAPIServer(Dependencies{})
	contract := buildContractAPI(http.NewServeMux())
	server.addContractRoutes(contract)
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
