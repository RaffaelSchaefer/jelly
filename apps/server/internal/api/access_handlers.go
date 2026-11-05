package api

import (
	"context"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// RedeemBody brings an account into a LAN. Name and color are needed for a new account only.
type RedeemBody struct {
	Code  string `json:"code"`
	Name  string `json:"name,omitempty"`
	Color string `json:"color,omitempty"`
}

// RedeemAnswer holds the secret of the account and whether it got the seat of the code.
type RedeemAnswer struct {
	Secret       string            `json:"secret"`
	SeatAssigned bool              `json:"seat_assigned"`
	Me           store.PlayerState `json:"me"`
}

// redeemOutput keeps the secret out of every cache.
type redeemOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         RedeemAnswer
}

// redeemInput is a code, with the secret of the account that wants to join. It stays out of the
// parameters, because the security of the route already documents it.
type redeemInput struct {
	Authorization string `header:"Authorization" hidden:"true"`
	Body          RedeemBody
}

// recoverOutput sends a new secret, which nothing may store on the way.
type recoverOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         RecoverAnswer
}

// RecoverBody exchanges a recovery code for a new secret.
type RecoverBody struct {
	Code string `json:"code"`
}

// RecoverAnswer holds the new secret of an account.
type RecoverAnswer struct {
	Secret string            `json:"secret"`
	Me     store.PlayerState `json:"me"`
}

// handleRedeemCode brings an account into a LAN with a code.
func (server *apiServer) handleRedeemCode(
	ctx context.Context, input *redeemInput,
) (*redeemOutput, error) {
	request := store.RedeemRequest{
		Code: input.Body.Code, Name: input.Body.Name, Color: input.Body.Color,
		PlayerID: noViewerPlayer,
	}
	if input.Authorization != "" {
		playerID, err := server.findPlayer(ctx, input.Authorization)
		if err != nil {
			return nil, err
		}
		request.PlayerID = playerID
	}
	access, err := server.Store.RedeemCode(ctx, request, server.currentMillis())
	if err != nil {
		return nil, err
	}
	// An existing account keeps its secret, which only the caller knows.
	secret := access.Secret
	if secret == "" {
		secret = strings.TrimPrefix(input.Authorization, bearerPrefix)
	}
	return &redeemOutput{
		CacheControl: cacheControlNoStore,
		Body: RedeemAnswer{
			Secret:       secret,
			SeatAssigned: access.SeatAssigned,
			Me:           access.Me,
		},
	}, nil
}

// handleRecoverAccount exchanges a recovery code for a new secret.
func (server *apiServer) handleRecoverAccount(
	ctx context.Context, input *jsonInput[RecoverBody],
) (*recoverOutput, error) {
	secret, state, err := server.Store.RecoverAccount(ctx, input.Body.Code, server.currentMillis())
	if err != nil {
		return nil, err
	}
	return &recoverOutput{
		CacheControl: cacheControlNoStore, Body: RecoverAnswer{Secret: secret, Me: state},
	}, nil
}
