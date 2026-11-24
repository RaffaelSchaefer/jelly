package api

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// pathWizardHat is where a jelly steals the hat of the wizard in the shop.
const pathWizardHat = "/wizard-hat"

// addWizardHatRoutes registers the hat that one jelly of a LAN can wear at a time.
func (server *apiServer) addWizardHatRoutes(contract huma.API) {
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "stealWizardHat", Method: http.MethodPost, Path: pathWizardHat,
		Summary: "Steal the hat of the wizard in the shop",
	}, server.handleStealWizardHat)
}

// handleStealWizardHat puts the hat of the wizard on the jelly, if nobody else wears it.
func (server *apiServer) handleStealWizardHat(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[store.PlayerState], error) {
	return answerWith(server.Store.StealWizardHat(ctx, playerID, server.currentMillis()))
}
