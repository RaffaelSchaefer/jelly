package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// addAdminRoutes registers the JSON API of the admin page.
func (server *apiServer) addAdminRoutes(mux *http.ServeMux) {
	routes := map[string]http.HandlerFunc{
		"GET /admin/api/players":                         server.handleListPlayers,
		"POST /admin/api/players/{id}/hide":              server.handleHidePlayer,
		"POST /admin/api/players/{id}/show":              server.handleShowPlayer,
		"POST /admin/api/players/{id}/reset-name":        server.handleResetName,
		"POST /admin/api/players/{id}/recovery-code":     server.handleCreateRecoveryCode,
		"DELETE /admin/api/players/{id}":                 server.handleDeletePlayer,
		"GET /admin/api/lans":                            server.handleListLANs,
		"POST /admin/api/lans":                           server.handleCreateLAN,
		"PUT /admin/api/lans/{id}/rules":                 server.handleUpdateRules,
		"PUT /admin/api/lans/{id}/join-code":             server.handleUpdateJoinCode,
		"GET /admin/api/lans/{id}/event-codes":           server.handleListEventCodes,
		"POST /admin/api/event-codes":                    server.handleCreateEventCode,
		"GET /admin/api/actions":                         server.handleListAdminActions,
		"POST /admin/api/awards":                         server.handleGiveAward,
		"GET /admin/api/lans/{id}/areas":                 server.handleListAreas,
		"POST /admin/api/lans/{id}/areas":                server.handleCreateArea,
		"PUT /admin/api/lans/{id}/areas/{area}":          server.handleUpdateArea,
		"DELETE /admin/api/lans/{id}/areas/{area}":       server.handleDeleteArea,
		"POST /admin/api/lans/{id}/areas/{area}/code":    server.handleIssueSeatCode,
		"GET /admin/api/lans/{id}/seat-codes":            server.handleListSeatCodes,
		"PUT /admin/api/lans/{id}/players/{player}/area": server.handleAssignArea,
		"PUT /admin/api/lans/{id}/map":                   server.handleImportMap,
		"POST /admin/api/lans/{id}/gathering":            server.handleStartGathering,
		"DELETE /admin/api/lans/{id}/gathering":          server.handleEndGathering,
	}
	for pattern, handler := range routes {
		mux.HandleFunc(pattern, server.requireAdmin(handler))
	}
}

// readPathID reads the `{id}` path value, answering with an error if it is invalid.
func (server *apiServer) readPathID(
	writer http.ResponseWriter, request *http.Request,
) (int64, bool) {
	return server.readPathValue(writer, request, "id")
}

// readPathValue reads a numeric path value, answering with an error if it is invalid.
func (server *apiServer) readPathValue(
	writer http.ResponseWriter, request *http.Request, name string,
) (int64, bool) {
	value, err := strconv.ParseInt(request.PathValue(name), 10, 64)
	if err != nil || value <= 0 {
		server.writeError(writer, request, store.ErrInvalidInput)
		return 0, false
	}
	return value, true
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
		server.writeOutcome(writer, request, map[string]bool{fieldHidden: true}, err)
	}
}

// handleShowPlayer brings a hidden jelly back.
func (server *apiServer) handleShowPlayer(writer http.ResponseWriter, request *http.Request) {
	playerID, valid := server.readPathID(writer, request)
	if valid {
		err := server.Store.ShowPlayer(request.Context(), playerID, server.currentMillis())
		server.writeOutcome(writer, request, map[string]bool{fieldHidden: false}, err)
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

// handleDeletePlayer removes an account and all its data.
func (server *apiServer) handleDeletePlayer(writer http.ResponseWriter, request *http.Request) {
	playerID, valid := server.readPathID(writer, request)
	if valid {
		err := server.Store.DeletePlayer(request.Context(), playerID, server.currentMillis())
		server.writeOutcome(writer, request, map[string]bool{fieldDeleted: true}, err)
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
	server.writeOutcome(writer, request, map[string]bool{fieldCreated: true}, err)
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
	err := server.Store.UpdateLANRules(request.Context(), lanID, body, server.currentMillis())
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
	server.writeOutcome(writer, request, map[string]bool{fieldCreated: true}, err)
}

// handleCreateRecoveryCode gives an account a code that replaces a lost secret.
func (server *apiServer) handleCreateRecoveryCode(
	writer http.ResponseWriter, request *http.Request,
) {
	playerID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	var body struct {
		ValidSeconds *int64 `json:"valid_seconds"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	validSeconds := store.DefaultRecoverySeconds
	if body.ValidSeconds != nil {
		validSeconds = *body.ValidSeconds
	}
	recovery, err := server.Store.CreateRecoveryCode(
		request.Context(), playerID, validSeconds, server.currentMillis(),
	)
	server.writeOutcome(writer, request, recovery, err)
}

// handleIssueSeatCode gives a seat a new code, optionally bound to an existing account.
func (server *apiServer) handleIssueSeatCode(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	areaID, valid := server.readPathValue(writer, request, "area")
	if !valid {
		return
	}
	var body struct {
		PlayerID *int64 `json:"player_id"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	code, err := server.Store.IssueSeatCode(
		request.Context(), lanID, areaID, body.PlayerID, server.currentMillis(),
	)
	server.writeOutcome(writer, request, code, err)
}

// handleListSeatCodes returns the codes of a LAN for the admin map.
func (server *apiServer) handleListSeatCodes(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if valid {
		codes, err := server.Store.ListSeatCodes(request.Context(), lanID)
		server.writeOutcome(writer, request, codes, err)
	}
}

// handleListAreas returns the room map of a LAN and who belongs where.
func (server *apiServer) handleListAreas(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	areas, err := server.Store.ListAreas(request.Context(), lanID)
	if err != nil {
		server.writeError(writer, request, err)
		return
	}
	assignments, err := server.Store.ListAreaAssignments(request.Context(), lanID)
	server.writeOutcome(writer, request, map[string]any{
		"areas": areas, "assignments": assignments,
	}, err)
}

// handleCreateArea adds an area to the room map.
func (server *apiServer) handleCreateArea(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	var body store.AdminArea
	if !server.readJSON(writer, request, &body) {
		return
	}
	body.MapID = ""
	area, err := server.Store.CreateArea(request.Context(), lanID, body, server.currentMillis())
	server.writeOutcome(writer, request, area, err)
}

// handleUpdateArea moves, resizes, renames or reassigns an area. Its jellies stay while they can
// stand there.
func (server *apiServer) handleUpdateArea(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	areaID, valid := server.readPathValue(writer, request, "area")
	if !valid {
		return
	}
	var body store.AdminArea
	if !server.readJSON(writer, request, &body) {
		return
	}
	body.ID = areaID
	err := server.Store.UpdateArea(request.Context(), lanID, body, server.currentMillis())
	server.writeOutcome(writer, request, body, err)
}

// handleImportMap brings the zones of a LAN in line with a map file and reports what changed.
func (server *apiServer) handleImportMap(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	var roomMap rules.RoomMap
	if !server.readLimitedJSON(writer, request, &roomMap, maxMapBytes) {
		return
	}
	if !rules.IsMapSizeValid(roomMap) {
		server.writeProblem(writer, problem{
			http.StatusBadRequest, codeInvalidMap,
			"Dieses Kartenformat kennt der Server nicht, oder die Karte ist zu groß.",
		})
		return
	}
	invalid := rules.ListInvalidMapZones(roomMap.Zones)
	if len(invalid) > 0 {
		server.writeProblem(writer, problem{
			http.StatusBadRequest, codeInvalidMap,
			"Diese Zonen sind ungültig: " + strings.Join(invalid, ", "),
		})
		return
	}
	report, err := server.Store.ImportMap(
		request.Context(), lanID, roomMap, server.currentMillis(),
	)
	server.writeOutcome(writer, request, report, err)
}

// handleStartGathering sends all jellies of a LAN somewhere for a while.
func (server *apiServer) handleStartGathering(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	var body store.NewGathering
	if !server.readJSON(writer, request, &body) {
		return
	}
	gathering, err := server.Store.StartGathering(
		request.Context(), lanID, body, server.currentMillis(),
	)
	server.writeOutcome(writer, request, gathering, err)
}

// handleEndGathering ends a running gathering early.
func (server *apiServer) handleEndGathering(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	err := server.Store.EndGathering(request.Context(), lanID, server.currentMillis())
	server.writeOutcome(writer, request, map[string]bool{fieldEnded: true}, err)
}

// handleDeleteArea removes an area and the assignments to it.
func (server *apiServer) handleDeleteArea(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	areaID, valid := server.readPathValue(writer, request, "area")
	if valid {
		err := server.Store.DeleteArea(request.Context(), lanID, areaID, server.currentMillis())
		server.writeOutcome(writer, request, map[string]bool{fieldDeleted: true}, err)
	}
}

// handleAssignArea places a player in an area, or removes them with `area_id` null.
func (server *apiServer) handleAssignArea(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	playerID, valid := server.readPathValue(writer, request, "player")
	if !valid {
		return
	}
	var body struct {
		AreaID *int64 `json:"area_id"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	err := server.Store.AssignArea(
		request.Context(), lanID, playerID, body.AreaID, server.currentMillis(),
	)
	server.writeOutcome(writer, request, map[string]*int64{"area_id": body.AreaID}, err)
}

// handleListAdminActions returns the newest entries of the admin log.
func (server *apiServer) handleListAdminActions(
	writer http.ResponseWriter, request *http.Request,
) {
	actions, err := server.Store.ListAdminActions(request.Context())
	server.writeOutcome(writer, request, actions, err)
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

// handleUpdateJoinCode replaces the join code of a LAN.
func (server *apiServer) handleUpdateJoinCode(
	writer http.ResponseWriter, request *http.Request,
) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	var body struct {
		JoinCode string `json:"join_code"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	err := server.Store.UpdateJoinCode(
		request.Context(), lanID, body.JoinCode, server.currentMillis(),
	)
	server.writeOutcome(writer, request, map[string]bool{fieldUpdated: true}, err)
}
