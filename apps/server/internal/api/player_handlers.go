package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const (
	actionPoke = "poke"
	pathMe     = "/me"
	pathSign   = "/sign"
	pathFollow = "/follow"
)

// errUnknownAction reports an action that the server does not know.
var errUnknownAction = errors.New("unknown action")

// KeyBody is a request that names one entry of a fixed list.
type KeyBody struct {
	Key string `json:"key"`
}

// CodeBody is a request with one code.
type CodeBody struct {
	Code string `json:"code"`
}

// RegisterBody creates an account.
type RegisterBody struct {
	Code  string `json:"code"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// RegisterAnswer holds the token, which is only ever sent here.
type RegisterAnswer struct {
	Token string      `json:"token"`
	Me    store.State `json:"me"`
}

// ProfileBody changes the profile. Missing fields stay unchanged.
type ProfileBody struct {
	Name     *string `json:"name,omitempty"`
	Color    *string `json:"color,omitempty"`
	Cosmetic *string `json:"cosmetic,omitempty"`
}

// ActionBody names a poke or a food or drink report.
type ActionBody struct {
	Action string `json:"action"`
}

// ActionAnswer tells how much XP an action earned.
type ActionAnswer struct {
	XPGained int         `json:"xp_gained"`
	Me       store.State `json:"me"`
}

// FollowBody names the jelly to stand next to.
type FollowBody struct {
	PlayerID int64 `json:"player_id"`
}

// Catalog holds the fixed lists. Secret achievements are not part of it.
type Catalog struct {
	Emotes        []rules.CatalogEntry `json:"emotes"`
	PartnerEmotes []rules.CatalogEntry `json:"partner_emotes"`
	Signs         []rules.CatalogEntry `json:"signs"`
	Cosmetics     []rules.Cosmetic     `json:"cosmetics"`
	Achievements  []rules.Achievement  `json:"achievements"`
}

// addHealthRoute registers the check that infrastructure uses. It is not part of the contract.
func (server *apiServer) addHealthRoute(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", server.handleHealth)
}

// handleHealth reports whether the server works and the database is reachable.
func (server *apiServer) handleHealth(writer http.ResponseWriter, request *http.Request) {
	err := server.Store.PingDatabase(request.Context())
	server.writeOutcome(writer, request, map[string]string{"status": "ok"}, err)
}

// addPlayerRoutes registers what a player client uses to manage its account.
func (server *apiServer) addPlayerRoutes(contract huma.API) {
	addOperation(server, contract, huma.Operation{
		OperationID: "getCatalog", Method: http.MethodGet, Path: "/catalog",
		Summary: "Read the fixed lists",
	}, handleCatalog)
	addOperation(server, contract, huma.Operation{
		OperationID: "register", Method: http.MethodPost, Path: "/register",
		Summary: "Create an account", DefaultStatus: http.StatusCreated,
		Middlewares: huma.Middlewares{server.limitContractAttempts},
	}, server.handleRegister)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "joinCurrentLAN", Method: http.MethodPost, Path: "/lans/current/join",
		Summary:     "Join the running LAN with an existing account",
		Middlewares: huma.Middlewares{server.limitContractAttempts},
	}, server.handleJoin)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "getMe", Method: http.MethodGet, Path: pathMe,
		Summary: "Read the state of the player",
	}, server.handleMe)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "updateMe", Method: http.MethodPatch, Path: pathMe,
		Summary: "Change name, color or cosmetic",
	}, server.handleUpdateProfile)
}

// addActionRoutes registers what a player does during the LAN.
func (server *apiServer) addActionRoutes(contract huma.API) {
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "applyAction", Method: http.MethodPost, Path: "/actions",
		Summary: "Poke or report food or drink",
	}, server.handleAction)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "redeemEventCode", Method: http.MethodPost, Path: "/redeem",
		Summary:     "Redeem an event code",
		Middlewares: huma.Middlewares{server.limitContractAttempts},
	}, server.handleRedeem)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "playEmote", Method: http.MethodPost, Path: "/emote",
		Summary: "Play an emote",
	}, server.handleEmote)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "showSign", Method: http.MethodPut, Path: pathSign,
		Summary: "Show a sign",
	}, server.handleSetSign)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "lowerSign", Method: http.MethodDelete, Path: pathSign,
		Summary: "Lower the sign", DefaultStatus: http.StatusOK,
	}, server.handleClearSign)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "followPlayer", Method: http.MethodPut, Path: pathFollow,
		Summary: "Stand next to another jelly",
		Description: "The server may end this by itself later, " +
			"so read `follow_player_id` instead of assuming it stays set.",
	}, server.handleSetFollow)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "stopFollowing", Method: http.MethodDelete, Path: pathFollow,
		Summary: "Walk away from the other jelly", DefaultStatus: http.StatusOK,
	}, server.handleClearFollow)
}

// answerWith wraps a result for the response, or passes on the error.
func answerWith[Body any](body Body, err error) (*jsonOutput[Body], error) {
	if err != nil {
		return nil, err
	}
	return &jsonOutput[Body]{Body: body}, nil
}

// handleCatalog returns the fixed lists.
func handleCatalog(_ context.Context, _ *noInput) (*jsonOutput[Catalog], error) {
	achievements := []rules.Achievement{}
	for _, achievement := range rules.ListAchievements() {
		if !achievement.Secret {
			achievements = append(achievements, achievement)
		}
	}
	return answerWith(Catalog{
		Emotes:        rules.ListEmotes(),
		PartnerEmotes: rules.ListPartnerEmotes(),
		Signs:         rules.ListSigns(),
		Cosmetics:     rules.ListCosmetics(),
		Achievements:  achievements,
	}, nil)
}

// handleRegister creates an account and returns its token once.
func (server *apiServer) handleRegister(
	ctx context.Context, input *jsonInput[RegisterBody],
) (*jsonOutput[RegisterAnswer], error) {
	registration := store.RegisterRequest{
		Code: input.Body.Code, Name: input.Body.Name, Color: input.Body.Color,
	}
	token, state, err := server.Store.RegisterPlayer(ctx, registration, server.currentMillis())
	return answerWith(RegisterAnswer{Token: token, Me: state}, err)
}

// handleJoin adds an existing account to the running LAN.
func (server *apiServer) handleJoin(
	ctx context.Context, playerID int64, input *jsonInput[CodeBody],
) (*jsonOutput[store.State], error) {
	return answerWith(
		server.Store.JoinCurrentLAN(ctx, playerID, input.Body.Code, server.currentMillis()),
	)
}

// handleMe returns the state of the calling player.
func (server *apiServer) handleMe(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[store.State], error) {
	return answerWith(server.Store.LoadPlayerState(ctx, playerID, server.currentMillis()))
}

// handleUpdateProfile changes name, color or cosmetic.
func (server *apiServer) handleUpdateProfile(
	ctx context.Context, playerID int64, input *jsonInput[ProfileBody],
) (*jsonOutput[store.State], error) {
	update := store.ProfileUpdate{
		Name: input.Body.Name, Color: input.Body.Color, Cosmetic: input.Body.Cosmetic,
	}
	return answerWith(server.Store.UpdateProfile(ctx, playerID, update, server.currentMillis()))
}

// handleAction applies a poke or a food or drink report.
func (server *apiServer) handleAction(
	ctx context.Context, playerID int64, input *jsonInput[ActionBody],
) (*jsonOutput[ActionAnswer], error) {
	var gainedXP int
	var state store.State
	var err error
	switch input.Body.Action {
	case actionPoke:
		gainedXP, state, err = server.Store.ApplyPoke(ctx, playerID, server.currentMillis())
	case rules.ActionFood, rules.ActionDrink:
		gainedXP, state, err = server.Store.ApplyReport(
			ctx, playerID, input.Body.Action, server.currentMillis(),
		)
	default:
		err = errUnknownAction
	}
	return answerWith(ActionAnswer{XPGained: gainedXP, Me: state}, err)
}

// handleRedeem redeems an event code.
func (server *apiServer) handleRedeem(
	ctx context.Context, playerID int64, input *jsonInput[CodeBody],
) (*jsonOutput[store.RedeemedCode], error) {
	return answerWith(
		server.Store.RedeemEventCode(ctx, playerID, input.Body.Code, server.currentMillis()),
	)
}

// handleEmote plays an emote from the fixed list.
func (server *apiServer) handleEmote(
	ctx context.Context, playerID int64, input *jsonInput[KeyBody],
) (*jsonOutput[store.State], error) {
	return answerWith(
		server.Store.ApplyEmote(ctx, playerID, input.Body.Key, server.currentMillis()),
	)
}

// handleSetSign shows a sign from the fixed list.
func (server *apiServer) handleSetSign(
	ctx context.Context, playerID int64, input *jsonInput[KeyBody],
) (*jsonOutput[store.State], error) {
	if input.Body.Key == "" {
		return nil, rules.ErrUnknownSign
	}
	return answerWith(
		server.Store.UpdateSign(ctx, playerID, input.Body.Key, server.currentMillis()),
	)
}

// handleClearSign lowers the sign.
func (server *apiServer) handleClearSign(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[store.State], error) {
	return answerWith(server.Store.UpdateSign(ctx, playerID, "", server.currentMillis()))
}

// handleSetFollow stands next to another jelly.
func (server *apiServer) handleSetFollow(
	ctx context.Context, playerID int64, input *jsonInput[FollowBody],
) (*jsonOutput[store.State], error) {
	if input.Body.PlayerID <= 0 {
		return nil, store.ErrInvalidFollow
	}
	return answerWith(
		server.Store.UpdateFollow(ctx, playerID, input.Body.PlayerID, server.currentMillis()),
	)
}

// handleClearFollow walks away from the other jelly.
func (server *apiServer) handleClearFollow(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[store.State], error) {
	return answerWith(server.Store.UpdateFollow(ctx, playerID, 0, server.currentMillis()))
}
