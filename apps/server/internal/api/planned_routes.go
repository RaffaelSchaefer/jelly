package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// errNotImplemented answers routes that are in the contract but do not work yet.
var errNotImplemented = errors.New("not implemented")

// HighlightBody names the jelly to find on the stage.
type HighlightBody struct {
	PlayerID int64 `json:"player_id"`
}

// StackMemberBody names the stack to join.
type StackMemberBody struct {
	StackID int64 `json:"stack_id"`
}

// addPlannedRoutes registers routes that clients can already build against. They answer with
// `501 not_implemented` until the server plans the movement of the jellies.
func (server *apiServer) addPlannedRoutes(contract huma.API) {
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "highlightJelly", Method: http.MethodPost, Path: "/highlights",
		Summary: "Highlight a jelly on the stage", Description: plannedNote,
	}, answerNotImplemented[HighlightBody])
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "startStack", Method: http.MethodPost, Path: "/stacks",
		Summary: "Start a stack where the jelly stands", Description: plannedNote,
	}, answerNotImplementedWithoutBody)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "joinStack", Method: http.MethodPost, Path: "/stacks/members",
		Summary: "Join a stack nearby", Description: plannedNote,
	}, answerNotImplemented[StackMemberBody])
}

// plannedNote tells client developers what to expect from these routes.
const plannedNote = "Not available yet, answers `501 not_implemented`."

// answerNotImplemented is the handler of a planned route.
func answerNotImplemented[Body any](
	context.Context, int64, *jsonInput[Body],
) (*jsonOutput[store.PlayerState], error) {
	return nil, errNotImplemented
}

// answerNotImplementedWithoutBody is the handler of a planned route without a body.
func answerNotImplementedWithoutBody(
	context.Context, int64, *noInput,
) (*jsonOutput[store.PlayerState], error) {
	return nil, errNotImplemented
}

// problemNotImplemented is the answer to a planned route.
func problemNotImplemented() problem {
	return problem{
		http.StatusNotImplemented,
		"not_implemented",
		"Das kommt bald, der Server kann es noch nicht.",
	}
}
