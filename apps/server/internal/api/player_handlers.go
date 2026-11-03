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
	pathMe              = "/players/me"
	pathSign            = "/signs/current"
	pathCurrentTrip     = "/trips/current"
	cacheControlNoStore = "no-store"
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

// RedeemBody exchanges a code for a secret. Name and color are needed for a new account only.
type RedeemBody struct {
	Code  string `json:"code"`
	Name  string `json:"name,omitempty"`
	Color string `json:"color,omitempty"`
}

// RedeemAnswer holds the secret, which is only ever sent here.
type RedeemAnswer struct {
	Secret string            `json:"secret"`
	Me     store.PlayerState `json:"me"`
}

// redeemOutput keeps the secret out of every cache.
type redeemOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         RedeemAnswer
}

// ProfileBody changes the profile. Missing fields stay unchanged.
type ProfileBody struct {
	Name     *string `json:"name,omitempty"`
	Color    *string `json:"color,omitempty"`
	Cosmetic *string `json:"cosmetic,omitempty"`
}

// ReportBody names a food or drink report.
type ReportBody struct {
	Kind string `json:"kind"`
}

// ActionAnswer tells how much XP an action earned.
type ActionAnswer struct {
	XPGained int               `json:"xp_gained"`
	Me       store.PlayerState `json:"me"`
}

// FollowBody names the jelly to stand next to.
type FollowBody struct {
	PlayerID int64 `json:"player_id"`
}

// VersionInfo tells an app whether it can still talk to this server.
type VersionInfo struct {
	APIVersion string `json:"api_version"`
	// MinClientVersion is in the form 1.2.3. Empty means no minimum.
	MinClientVersion string `json:"min_client_version"`
}

// Catalog holds the fixed lists. Secret achievements are not part of it.
type Catalog struct {
	Colors        []rules.CatalogEntry `json:"colors"`
	Emotes        []rules.CatalogEntry `json:"emotes"`
	PartnerEmotes []rules.CatalogEntry `json:"partner_emotes"`
	Signs         []rules.CatalogEntry `json:"signs"`
	Cosmetics     []rules.Cosmetic     `json:"cosmetics"`
	Achievements  []rules.Achievement  `json:"achievements"`
}

// addLANRoutes registers what a client reads before it has joined.
func (server *apiServer) addLANRoutes(contract huma.API) {
	addOperation(server, contract, huma.Operation{
		OperationID: "getCurrentLAN", Method: http.MethodGet, Path: "/lans/current",
		Summary: "Read which LAN runs and which comes next",
		Description: "Works without an account. With a token, `joined` says whether this " +
			"player takes part in the running LAN.",
		Security:    []map[string][]string{{}, {securityBearer: {}}},
		Middlewares: huma.Middlewares{server.identifyPlayer},
	}, server.handleCurrentLAN)
	addRootOperation(server, contract, huma.Operation{
		OperationID: "getVersion", Method: http.MethodGet, Path: "/version",
		Summary: "Read the API version and the oldest app that still works",
		Description: "Works without an account and stays at this path for every API version, " +
			"so old apps can always find out that they need an update.",
	}, server.handleVersion)
}

// handleVersion names the current API version and the oldest app that still works.
func (server *apiServer) handleVersion(
	context.Context, *noInput,
) (*jsonOutput[VersionInfo], error) {
	return &jsonOutput[VersionInfo]{Body: VersionInfo{
		APIVersion: APIVersion, MinClientVersion: server.MinClientVersion,
	}}, nil
}

// handleCurrentLAN returns the running and the next LAN.
func (server *apiServer) handleCurrentLAN(
	ctx context.Context, _ *noInput,
) (*jsonOutput[store.LANStatus], error) {
	return answerWith(server.Store.LoadLANStatus(ctx, readPlayerID(ctx), server.currentMillis()))
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
		OperationID: "redeemCode", Method: http.MethodPost, Path: "/auth/redeem",
		Summary: "Exchange a code for a secret",
		Description: "A seat code creates an account on that seat or brings back the account it " +
			"belongs to. Name and color are required for a new account. Any older secret of the " +
			"account stops working. A used code answers `409 code_redeemed`.",
		Middlewares: huma.Middlewares{server.limitRegistrations},
	}, server.handleRedeemCode)
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
		OperationID: "recordPresence", Method: http.MethodPost, Path: "/presence",
		Summary: "Keep the jelly awake while the app runs, without XP",
		Description: "Send this every few minutes. Without it, a jelly falls asleep once " +
			"`presence_window` passed since the last action.",
	}, server.handlePresence)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "pokeJelly", Method: http.MethodPost, Path: "/pokes",
		Summary:     "Poke the jelly",
		Description: "A poke that comes too early is no error, it earns `xp_gained: 0`.",
	}, server.handlePoke)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "createReport", Method: http.MethodPost, Path: "/reports",
		Summary: "Report food or drink",
	}, server.handleReport)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "redeemEventCode", Method: http.MethodPost, Path: "/event-codes/redemptions",
		Summary:     "Redeem an event code",
		Middlewares: huma.Middlewares{server.limitCodeAttempts},
	}, server.handleRedeem)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "playEmote", Method: http.MethodPost, Path: "/emotes",
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
		OperationID: "followPlayer", Method: http.MethodPost, Path: "/trips/follow",
		Summary: "Follow another jelly",
		Description: "The server may end this by itself later, " +
			"so read `follow_player_id` instead of assuming it stays set.",
	}, server.handleSetFollow)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "endTrip", Method: http.MethodDelete, Path: pathCurrentTrip,
		Summary: "Go back to the own place", DefaultStatus: http.StatusOK,
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
		Colors:        rules.ListColors(),
		Emotes:        rules.ListEmotes(),
		PartnerEmotes: rules.ListPartnerEmotes(),
		Signs:         rules.ListSigns(),
		Cosmetics:     rules.ListCosmetics(),
		Achievements:  achievements,
	}, nil)
}

// handleRedeemCode exchanges a code for a secret, which is only ever sent here.
func (server *apiServer) handleRedeemCode(
	ctx context.Context, input *jsonInput[RedeemBody],
) (*redeemOutput, error) {
	request := store.RedeemRequest{
		Code: input.Body.Code, Name: input.Body.Name, Color: input.Body.Color,
	}
	secret, state, err := server.Store.RedeemCode(ctx, request, server.currentMillis())
	if err != nil {
		return nil, err
	}
	return &redeemOutput{
		CacheControl: cacheControlNoStore, Body: RedeemAnswer{Secret: secret, Me: state},
	}, nil
}

// handleMe returns the state of the calling player.
func (server *apiServer) handleMe(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[store.PlayerState], error) {
	return answerWith(server.Store.LoadPlayerState(ctx, playerID, server.currentMillis()))
}

// handleUpdateProfile changes name, color or cosmetic.
func (server *apiServer) handleUpdateProfile(
	ctx context.Context, playerID int64, input *jsonInput[ProfileBody],
) (*jsonOutput[store.PlayerState], error) {
	update := store.ProfileUpdate{
		Name: input.Body.Name, Color: input.Body.Color, Cosmetic: input.Body.Cosmetic,
	}
	return answerWith(server.Store.UpdateProfile(ctx, playerID, update, server.currentMillis()))
}

// handlePresence keeps the jelly awake.
func (server *apiServer) handlePresence(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[store.PlayerState], error) {
	return answerWith(server.Store.RecordPresence(ctx, playerID, server.currentMillis()))
}

// handlePoke applies a poke.
func (server *apiServer) handlePoke(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[ActionAnswer], error) {
	gainedXP, state, err := server.Store.ApplyPoke(ctx, playerID, server.currentMillis())
	return answerWith(ActionAnswer{XPGained: gainedXP, Me: state}, err)
}

// handleReport applies a food or drink report.
func (server *apiServer) handleReport(
	ctx context.Context, playerID int64, input *jsonInput[ReportBody],
) (*jsonOutput[ActionAnswer], error) {
	kind := input.Body.Kind
	if kind != rules.ActionFood && kind != rules.ActionDrink {
		return nil, errUnknownAction
	}
	gainedXP, state, err := server.Store.ApplyReport(ctx, playerID, kind, server.currentMillis())
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
) (*jsonOutput[store.PlayerState], error) {
	return answerWith(
		server.Store.ApplyEmote(ctx, playerID, input.Body.Key, server.currentMillis()),
	)
}

// handleSetSign shows a sign from the fixed list.
func (server *apiServer) handleSetSign(
	ctx context.Context, playerID int64, input *jsonInput[KeyBody],
) (*jsonOutput[store.PlayerState], error) {
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
) (*jsonOutput[store.PlayerState], error) {
	return answerWith(server.Store.UpdateSign(ctx, playerID, "", server.currentMillis()))
}

// handleSetFollow follows another jelly.
func (server *apiServer) handleSetFollow(
	ctx context.Context, playerID int64, input *jsonInput[FollowBody],
) (*jsonOutput[store.PlayerState], error) {
	if input.Body.PlayerID <= 0 {
		return nil, store.ErrInvalidFollow
	}
	return answerWith(
		server.Store.UpdateFollow(ctx, playerID, input.Body.PlayerID, server.currentMillis()),
	)
}

// handleClearFollow ends the trip and goes back to the own place.
func (server *apiServer) handleClearFollow(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[store.PlayerState], error) {
	return answerWith(server.Store.UpdateFollow(ctx, playerID, 0, server.currentMillis()))
}
