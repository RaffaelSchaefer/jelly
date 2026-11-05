package api

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// HighlightBody names the jelly to find on the stage.
type HighlightBody struct {
	PlayerID int64 `json:"player_id"`
}

// StackMemberBody names the stack to join.
type StackMemberBody struct {
	StackID int64 `json:"stack_id"`
}

// addStackRoutes registers stacks and highlights.
func (server *apiServer) addStackRoutes(contract huma.API) {
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "highlightJelly", Method: http.MethodPost, Path: "/highlights",
		Summary: "Light up a jelly on the stage, so it can be found",
		Description: "Lights up the top of a stack and everyone on it earns `lighthouse`, " +
			"the top also `lighthouse-light`.",
	}, server.handleHighlight)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "startStack", Method: http.MethodPost, Path: "/stacks",
		Summary: "Start a stack where the jelly stands",
	}, server.handleStartStack)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "joinStack", Method: http.MethodPost, Path: "/stacks/members",
		Summary:     "Climb on top of a stack nearby",
		Description: "A stack further away than `near_distance` answers `409 too_far`.",
	}, server.handleJoinStack)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "leaveStack", Method: http.MethodDelete, Path: "/stacks/current",
		Summary: "Climb down from the stack", DefaultStatus: http.StatusOK,
	}, server.handleLeaveStack)
}

// handleHighlight lights up a jelly.
func (server *apiServer) handleHighlight(
	ctx context.Context, playerID int64, input *jsonInput[HighlightBody],
) (*jsonOutput[store.PlayerState], error) {
	return answerWith(server.Store.ApplyHighlight(
		ctx, playerID, input.Body.PlayerID, server.currentMillis(),
	))
}

// handleStartStack starts a stack at the current position of the jelly.
func (server *apiServer) handleStartStack(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[store.StackAnswer], error) {
	now := server.currentMillis()
	server.refreshMovement(ctx, now)
	position, ok := server.planner.FindPosition(playerID, now)
	if !ok {
		return nil, store.ErrTooFar
	}
	point := rules.StagePoint{X: position.X, Y: position.Y}
	return answerWith(server.Store.StartStack(ctx, playerID, point, now))
}

// handleJoinStack puts the jelly on top of a stack nearby.
func (server *apiServer) handleJoinStack(
	ctx context.Context, playerID int64, input *jsonInput[StackMemberBody],
) (*jsonOutput[store.StackAnswer], error) {
	now := server.currentMillis()
	server.refreshMovement(ctx, now)
	return answerWith(server.Store.JoinStack(ctx, store.StackJoin{
		PlayerID: playerID, StackID: input.Body.StackID, Now: now,
		IsNear: func(point rules.StagePoint, reach float64) bool {
			target := movement.Point{X: point.X, Y: point.Y}
			distance, known := server.planner.MeasureDistanceTo(playerID, target, now)
			return known && distance <= reach
		},
	}))
}

// handleLeaveStack takes the jelly off its stack.
func (server *apiServer) handleLeaveStack(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[store.PlayerState], error) {
	return answerWith(server.Store.LeaveStack(ctx, playerID, server.currentMillis()))
}
