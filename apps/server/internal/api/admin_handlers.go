package api

import (
	"net/http"
	"strconv"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// addAdminRoutes registers the JSON API of the admin page.
func (server *apiServer) addAdminRoutes(mux *http.ServeMux) {
	routes := map[string]http.HandlerFunc{
		"GET /admin/api/players":                    server.handleListPlayers,
		"POST /admin/api/players/{id}/hide":         server.handleHidePlayer,
		"POST /admin/api/players/{id}/show":         server.handleShowPlayer,
		"POST /admin/api/players/{id}/reset-name":   server.handleResetName,
		"POST /admin/api/players/{id}/rotate-token": server.handleRotateToken,
		"DELETE /admin/api/players/{id}":            server.handleDeletePlayer,
		"GET /admin/api/lans":                       server.handleListLANs,
		"POST /admin/api/lans":                      server.handleCreateLAN,
		"PUT /admin/api/lans/{id}/rules":            server.handleUpdateRules,
		"GET /admin/api/lans/{id}/event-codes":      server.handleListEventCodes,
		"POST /admin/api/event-codes":               server.handleCreateEventCode,
		"POST /admin/api/awards":                    server.handleGiveAward,
	}
	for pattern, handler := range routes {
		mux.HandleFunc(pattern, server.requireAdmin(handler))
	}
}

// readPathID reads the `{id}` path value, answering with an error if it is invalid.
func (server *apiServer) readPathID(
	writer http.ResponseWriter, request *http.Request,
) (int64, bool) {
	pathID, err := strconv.ParseInt(request.PathValue("id"), 10, 64)
	if err != nil || pathID <= 0 {
		server.writeError(writer, request, store.ErrInvalidInput)
		return 0, false
	}
	return pathID, true
}

// handleListPlayers searches players by name.
func (server *apiServer) handleListPlayers(writer http.ResponseWriter, request *http.Request) {
	players, err := server.Store.ListPlayers(request.Context(), request.URL.Query().Get("search"))
	server.writeOutcome(writer, request, players, err)
}

// handleHidePlayer takes a jelly off the stage.
func (server *apiServer) handleHidePlayer(writer http.ResponseWriter, request *http.Request) {
	playerID, valid := server.readPathID(writer, request)
	if valid {
		err := server.Store.HidePlayer(request.Context(), playerID, server.currentMillis())
		server.writeOutcome(writer, request, map[string]bool{"hidden": true}, err)
	}
}

// handleShowPlayer brings a hidden jelly back.
func (server *apiServer) handleShowPlayer(writer http.ResponseWriter, request *http.Request) {
	playerID, valid := server.readPathID(writer, request)
	if valid {
		err := server.Store.ShowPlayer(request.Context(), playerID, server.currentMillis())
		server.writeOutcome(writer, request, map[string]bool{"hidden": false}, err)
	}
}

// handleResetName replaces a name with a neutral one.
func (server *apiServer) handleResetName(writer http.ResponseWriter, request *http.Request) {
	playerID, valid := server.readPathID(writer, request)
	if valid {
		err := server.Store.ResetPlayerName(request.Context(), playerID, server.currentMillis())
		server.writeOutcome(writer, request, map[string]bool{"reset": true}, err)
	}
}

// handleRotateToken creates a new token for a lost account and returns it once.
func (server *apiServer) handleRotateToken(writer http.ResponseWriter, request *http.Request) {
	playerID, valid := server.readPathID(writer, request)
	if valid {
		token, err := server.Store.RotatePlayerToken(request.Context(), playerID)
		server.writeOutcome(writer, request, map[string]string{"token": token}, err)
	}
}

// handleDeletePlayer removes an account and all its data.
func (server *apiServer) handleDeletePlayer(writer http.ResponseWriter, request *http.Request) {
	playerID, valid := server.readPathID(writer, request)
	if valid {
		err := server.Store.DeletePlayer(request.Context(), playerID, server.currentMillis())
		server.writeOutcome(writer, request, map[string]bool{"deleted": true}, err)
	}
}

// handleListLANs returns all LANs with their rules.
func (server *apiServer) handleListLANs(writer http.ResponseWriter, request *http.Request) {
	lans, err := server.Store.ListLANs(request.Context(), server.currentMillis())
	server.writeOutcome(writer, request, lans, err)
}

// handleCreateLAN creates a LAN with the default rules.
func (server *apiServer) handleCreateLAN(writer http.ResponseWriter, request *http.Request) {
	var body store.NewLAN
	if !server.readJSON(writer, request, &body) {
		return
	}
	body.Rules = rules.DefaultRules()
	err := server.Store.CreateLAN(request.Context(), body)
	server.writeOutcome(writer, request, map[string]bool{"created": true}, err)
}

// handleUpdateRules replaces the rules of a LAN, also while it is running.
func (server *apiServer) handleUpdateRules(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	var body rules.Rules
	if !server.readJSON(writer, request, &body) {
		return
	}
	err := server.Store.UpdateLANRules(request.Context(), lanID, body)
	server.writeOutcome(writer, request, body, err)
}

// handleListEventCodes returns the event codes of a LAN.
func (server *apiServer) handleListEventCodes(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if valid {
		codes, err := server.Store.ListEventCodes(request.Context(), lanID)
		server.writeOutcome(writer, request, codes, err)
	}
}

// handleCreateEventCode creates a timed event code.
func (server *apiServer) handleCreateEventCode(writer http.ResponseWriter, request *http.Request) {
	var body store.NewEventCode
	if !server.readJSON(writer, request, &body) {
		return
	}
	err := server.Store.CreateEventCode(request.Context(), body, server.currentMillis())
	server.writeOutcome(writer, request, map[string]bool{"created": true}, err)
}

// handleGiveAward stores a prize, optionally with a permanent cosmetic.
func (server *apiServer) handleGiveAward(writer http.ResponseWriter, request *http.Request) {
	var body store.NewAward
	if !server.readJSON(writer, request, &body) {
		return
	}
	err := server.Store.GiveAward(request.Context(), body, server.currentMillis())
	server.writeOutcome(writer, request, map[string]bool{"given": true}, err)
}
