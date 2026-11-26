package api

import (
	"net/http"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// handlePatchRules changes only the rules that the body names, also while the LAN is running.
func (server *apiServer) handlePatchRules(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	body, err := server.Store.LoadLANRules(request.Context(), lanID)
	if err != nil {
		server.writeError(writer, request, err)
		return
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	err = server.saveRules(request, lanID, body)
	server.writeOutcome(writer, request, body, err)
}

// handleUpdateRules replaces all rules of a LAN, also while it is running.
func (server *apiServer) handleUpdateRules(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	// What a body leaves out goes back to its default. Use PATCH to change single rules.
	body := rules.DefaultRules()
	if !server.readJSON(writer, request, &body) {
		return
	}
	err := server.saveRules(request, lanID, body)
	server.writeOutcome(writer, request, body, err)
}

// saveRules stores the rules of a LAN. With `?relevel=true` it also changes the level rules after
// the start and pays the level coins the new curve owes.
func (server *apiServer) saveRules(
	request *http.Request,
	lanID int64,
	gameRules rules.Rules,
) error {
	if isQueryFlagSet(request, queryRelevel) {
		return server.Store.RelevelLAN(request.Context(), lanID, gameRules, server.currentMillis())
	}
	return server.Store.UpdateLANRules(request.Context(), lanID, gameRules, server.currentMillis())
}
