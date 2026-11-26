package api

import "net/http"

// fieldReset is the answer field of every reset.
const fieldReset = "reset"

// handleResetPlayerProgress sends one account of a LAN back to a freshly joined jelly.
func (server *apiServer) handleResetPlayerProgress(
	writer http.ResponseWriter, request *http.Request,
) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	playerID, valid := server.readPathValue(writer, request, "player")
	if !valid {
		return
	}
	err := server.Store.ResetPlayerProgress(
		request.Context(), lanID, playerID, server.currentMillis(),
	)
	server.writeOutcome(writer, request, map[string]bool{fieldReset: true}, err)
}

// handleResetLAN sends every account of a LAN back to a freshly joined jelly.
func (server *apiServer) handleResetLAN(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if valid {
		err := server.Store.ResetLANProgress(request.Context(), lanID, server.currentMillis())
		server.writeOutcome(writer, request, map[string]bool{fieldReset: true}, err)
	}
}
