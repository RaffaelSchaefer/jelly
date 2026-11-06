package api

import (
	"net/http"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// queryDryRun asks a map import to only report what it would change.
const queryDryRun = "dry_run"

// gatheringAnswer wraps the running gathering, so that the answer is an object even without one.
type gatheringAnswer struct {
	Gathering *store.Gathering `json:"gathering"`
}

// handleLoadGathering says whether a food event or a ceremony is running, so the admin page can
// show it after a reload.
func (server *apiServer) handleLoadGathering(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	gathering, err := server.Store.LoadGathering(request.Context(), lanID, server.currentMillis())
	server.writeOutcome(writer, request, gatheringAnswer{Gathering: gathering}, err)
}

// handleEndEventCode makes an event code invalid from now on.
func (server *apiServer) handleEndEventCode(writer http.ResponseWriter, request *http.Request) {
	codeID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	err := server.Store.EndEventCode(request.Context(), codeID, server.currentMillis())
	server.writeOutcome(writer, request, map[string]bool{fieldUpdated: true}, err)
}
