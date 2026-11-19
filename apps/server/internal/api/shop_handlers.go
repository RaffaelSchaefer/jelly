package api

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// pathPurchases is where a player buys a cosmetic from the shop.
const pathPurchases = "/purchases"

// addShopRoutes registers what a player buys with its coins.
func (server *apiServer) addShopRoutes(contract huma.API) {
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "purchaseCosmetic", Method: http.MethodPost, Path: pathPurchases,
		Summary: "Buy a cosmetic from the shop",
	}, server.handlePurchaseCosmetic)
}

// handlePurchaseCosmetic buys one cosmetic.
func (server *apiServer) handlePurchaseCosmetic(
	ctx context.Context, playerID int64, input *jsonInput[KeyBody],
) (*jsonOutput[store.PurchaseAnswer], error) {
	return answerWith(
		server.Store.PurchaseCosmetic(ctx, playerID, input.Body.Key, server.currentMillis()),
	)
}
