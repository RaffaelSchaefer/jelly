package api

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// maxScheduleBytes fits a program of a few hundred points, far above the 4 KiB of other bodies.
const maxScheduleBytes = 128 << 10

// Schedule is the program of a LAN, sorted by start.
type Schedule struct {
	Items []rules.ScheduleItem `json:"items"`
}

// addScheduleRoute registers the program, which a client reads like the current LAN.
func (server *apiServer) addScheduleRoute(contract huma.API) {
	addOperation(server, contract, huma.Operation{
		OperationID: "getSchedule", Method: http.MethodGet, Path: "/lans/current/schedule",
		Summary: "Read the program of the running LAN, otherwise of the next one",
	}, server.handleSchedule)
}

// handleSchedule returns the program of the LAN whose rules `GET /lans/current` names.
func (server *apiServer) handleSchedule(
	ctx context.Context, _ *noInput,
) (*jsonOutput[Schedule], error) {
	items, err := server.Store.LoadCurrentSchedule(ctx, server.currentMillis())
	return answerWith(Schedule{Items: items}, err)
}

// handleLoadLANSchedule returns the program of one LAN for the admin page.
func (server *apiServer) handleLoadLANSchedule(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	items, err := server.Store.LoadLANSchedule(request.Context(), lanID)
	server.writeOutcome(writer, request, Schedule{Items: items}, err)
}

// handleReplaceLANSchedule replaces the whole program of a LAN and answers with what was stored.
func (server *apiServer) handleReplaceLANSchedule(
	writer http.ResponseWriter,
	request *http.Request,
) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	var body Schedule
	if !server.readLimitedJSON(writer, request, &body, maxScheduleBytes) {
		return
	}
	if body.Items == nil {
		body.Items = []rules.ScheduleItem{}
	}
	items, err := server.Store.ReplaceLANSchedule(
		request.Context(), lanID, body.Items, server.currentMillis(),
	)
	server.writeOutcome(writer, request, Schedule{Items: items}, err)
}
