package api

import (
	"net/http"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const actionPoke = "poke"

// keyBody is the request body of routes that take one key or code.
type keyBody struct {
	Key string `json:"key"`
}

// addPlayerRoutes registers everything a player client uses.
func (server *apiServer) addPlayerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", server.handleHealth)
	mux.HandleFunc("GET /catalog", server.handleCatalog)
	mux.HandleFunc("POST /register", server.limitAttempts(server.handleRegister))
	mux.HandleFunc("POST /lans/current/join",
		server.limitAttempts(server.requirePlayer(server.handleJoin)))
	mux.HandleFunc("GET /me", server.requirePlayer(server.handleMe))
	mux.HandleFunc("PATCH /me", server.requirePlayer(server.handleUpdateProfile))
	mux.HandleFunc("POST /actions", server.requirePlayer(server.handleAction))
	mux.HandleFunc("POST /redeem", server.limitAttempts(server.requirePlayer(server.handleRedeem)))
	mux.HandleFunc("POST /emote", server.requirePlayer(server.handleEmote))
	mux.HandleFunc("PUT /sign", server.requirePlayer(server.handleSetSign))
	mux.HandleFunc("DELETE /sign", server.requirePlayer(server.handleClearSign))
	mux.HandleFunc("PUT /follow", server.requirePlayer(server.handleSetFollow))
	mux.HandleFunc("DELETE /follow", server.requirePlayer(server.handleClearFollow))
}

// handleHealth reports whether the server works and the database is reachable.
func (server *apiServer) handleHealth(writer http.ResponseWriter, request *http.Request) {
	err := server.Store.PingDatabase(request.Context())
	server.writeOutcome(writer, request, map[string]string{"status": "ok"}, err)
}

// handleCatalog returns the fixed lists. Secret achievements stay out of it.
func (server *apiServer) handleCatalog(writer http.ResponseWriter, _ *http.Request) {
	achievements := []rules.Achievement{}
	for _, achievement := range rules.ListAchievements() {
		if !achievement.Secret {
			achievements = append(achievements, achievement)
		}
	}
	server.writeJSON(writer, http.StatusOK, map[string]any{
		"emotes":         rules.ListEmotes(),
		"partner_emotes": rules.ListPartnerEmotes(),
		"signs":          rules.ListSigns(),
		"cosmetics":      rules.ListCosmetics(),
		"achievements":   achievements,
	})
}

// handleRegister creates an account and returns its token once.
func (server *apiServer) handleRegister(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Code  string `json:"code"`
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	registration := store.RegisterRequest{Code: body.Code, Name: body.Name, Color: body.Color}
	token, state, err := server.Store.RegisterPlayer(
		request.Context(), registration, server.currentMillis(),
	)
	if err != nil {
		server.writeError(writer, request, err)
		return
	}
	server.writeJSON(writer, http.StatusCreated, map[string]any{fieldToken: token, fieldMe: state})
}

// handleJoin adds an existing account to the running LAN.
func (server *apiServer) handleJoin(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	var body struct {
		Code string `json:"code"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	state, err := server.Store.JoinCurrentLAN(
		request.Context(), playerID, body.Code, server.currentMillis(),
	)
	server.writeOutcome(writer, request, state, err)
}

// handleMe returns the state of the calling player.
func (server *apiServer) handleMe(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	state, err := server.Store.LoadPlayerState(
		request.Context(), playerID, server.currentMillis(),
	)
	server.writeOutcome(writer, request, state, err)
}

// handleUpdateProfile changes name, color or cosmetic. Missing fields stay unchanged.
func (server *apiServer) handleUpdateProfile(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	var body struct {
		Name     *string `json:"name"`
		Color    *string `json:"color"`
		Cosmetic *string `json:"cosmetic"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	update := store.ProfileUpdate{Name: body.Name, Color: body.Color, Cosmetic: body.Cosmetic}
	state, err := server.Store.UpdateProfile(
		request.Context(), playerID, update, server.currentMillis(),
	)
	server.writeOutcome(writer, request, state, err)
}

// handleAction applies a poke or a food or drink report.
func (server *apiServer) handleAction(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	var body struct {
		Action string `json:"action"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	var gainedXP int
	var state store.State
	var err error
	switch body.Action {
	case actionPoke:
		gainedXP, state, err = server.Store.ApplyPoke(
			request.Context(), playerID, server.currentMillis(),
		)
	case rules.ActionFood, rules.ActionDrink:
		gainedXP, state, err = server.Store.ApplyReport(
			request.Context(), playerID, body.Action, server.currentMillis(),
		)
	default:
		server.writeProblem(writer, problemUnknownAction())
		return
	}
	server.writeOutcome(writer, request, map[string]any{"xp_gained": gainedXP, fieldMe: state}, err)
}

// handleRedeem redeems an event code.
func (server *apiServer) handleRedeem(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	var body struct {
		Code string `json:"code"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	redeemed, err := server.Store.RedeemEventCode(
		request.Context(), playerID, body.Code, server.currentMillis(),
	)
	server.writeOutcome(writer, request, redeemed, err)
}

// handleEmote plays an emote from the fixed list.
func (server *apiServer) handleEmote(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	var body keyBody
	if !server.readJSON(writer, request, &body) {
		return
	}
	state, err := server.Store.ApplyEmote(
		request.Context(), playerID, body.Key, server.currentMillis(),
	)
	server.writeOutcome(writer, request, state, err)
}

// handleSetSign shows a sign from the fixed list.
func (server *apiServer) handleSetSign(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	var body keyBody
	if !server.readJSON(writer, request, &body) {
		return
	}
	if body.Key == "" {
		server.writeError(writer, request, rules.ErrUnknownSign)
		return
	}
	state, err := server.Store.UpdateSign(
		request.Context(), playerID, body.Key, server.currentMillis(),
	)
	server.writeOutcome(writer, request, state, err)
}

// handleClearSign lowers the sign.
func (server *apiServer) handleClearSign(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	state, err := server.Store.UpdateSign(request.Context(), playerID, "", server.currentMillis())
	server.writeOutcome(writer, request, state, err)
}

// handleSetFollow stands next to another jelly.
func (server *apiServer) handleSetFollow(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	var body struct {
		PlayerID int64 `json:"player_id"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	if body.PlayerID <= 0 {
		server.writeError(writer, request, store.ErrInvalidFollow)
		return
	}
	state, err := server.Store.UpdateFollow(
		request.Context(), playerID, body.PlayerID, server.currentMillis(),
	)
	server.writeOutcome(writer, request, state, err)
}

// handleClearFollow walks away from the other jelly.
func (server *apiServer) handleClearFollow(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	state, err := server.Store.UpdateFollow(request.Context(), playerID, 0, server.currentMillis())
	server.writeOutcome(writer, request, state, err)
}
