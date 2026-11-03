package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strconv"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const (
	streamPollInterval  = 500 * time.Millisecond
	streamKeepAliveTick = 30
	pathStream          = versionPrefix + "/events/stream"
	querySince          = "since"
	paramInQuery        = "query"
	paramInHeader       = "header"
	headerLastEventID   = "Last-Event-ID"
	// Enough to bridge a short outage on a busy LAN.
	maxPlayerReplayEvents = 1000
)

// addStageRoutes registers what the stage and other viewers read.
func (server *apiServer) addStageRoutes(contract huma.API) {
	addOperation(server, contract, huma.Operation{
		OperationID: "getStage", Method: http.MethodGet, Path: "/stage",
		Summary:     "Read all visible jellies and areas",
		Security:    listViewerSecurity(),
		Middlewares: huma.Middlewares{server.authenticateViewer},
	}, server.handleState)
	contract.OpenAPI().AddOperation(&huma.Operation{
		OperationID: "streamEvents", Method: http.MethodGet, Path: pathStream,
		Summary: "Receive events as server-sent events",
		Description: "Starts after `Last-Event-ID`, then `since`, otherwise at the newest event. " +
			"Players can only go back " + strconv.Itoa(maxPlayerReplayEvents) + " events.",
		Security:   listViewerSecurity(),
		Parameters: buildStreamParameters(),
		Responses: map[string]*huma.Response{
			"200":           buildStreamResponse(contract),
			responseDefault: buildErrorResponse(contract),
		},
	})
}

// addStreamRoute registers the stream, which needs the raw connection instead of one response.
func (server *apiServer) addStreamRoute(mux *http.ServeMux) {
	mux.HandleFunc("GET "+pathStream, server.requireViewer(server.handleStream))
}

// buildStreamParameters documents where a stream resumes.
func buildStreamParameters() []*huma.Param {
	integer := &huma.Schema{Type: huma.TypeInteger, Format: "int64"}
	return []*huma.Param{
		{Name: querySince, In: paramInQuery, Schema: integer},
		{Name: headerLastEventID, In: paramInHeader, Schema: integer},
		{Name: queryStageKey, In: paramInQuery, Schema: &huma.Schema{Type: huma.TypeString}},
	}
}

// listViewerSecurity documents the two ways to read the stage.
func listViewerSecurity() []map[string][]string {
	return []map[string][]string{{securityBearer: {}}, {securityStageKey: {}}}
}

// buildStreamResponse documents one event of the stream.
func buildStreamResponse(contract huma.API) *huma.Response {
	schema := contract.OpenAPI().Components.Schemas.Schema(
		reflect.TypeFor[store.Event](), true, "",
	)
	return &huma.Response{
		Description: "A stream where the data of each message is one event",
		Content:     map[string]*huma.MediaType{"text/event-stream": {Schema: schema}},
	}
}

// handleState returns all visible jellies and the event ID to resume from.
func (server *apiServer) handleState(
	ctx context.Context, _ *noInput,
) (*jsonOutput[store.StageState], error) {
	return answerWith(server.Store.LoadStageState(ctx, server.currentMillis()))
}

// handleStream sends new events as SSE. It reads the event log in a loop instead of using a
// broadcaster, so a restart or slow client cannot lose events and no extra goroutine is needed.
func (server *apiServer) handleStream(
	writer http.ResponseWriter, request *http.Request, viewerID int64,
) {
	afterID, err := server.findStreamStart(request, viewerID)
	if err != nil {
		server.writeError(writer, request, err)
		return
	}
	controller := http.NewResponseController(writer)
	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(http.StatusOK)
	if controller.Flush() != nil {
		return
	}

	ticker := time.NewTicker(streamPollInterval)
	defer ticker.Stop()
	for tick := 1; ; tick++ {
		select {
		case <-request.Context().Done():
			return
		case <-ticker.C:
		}
		if server.IsStopping() {
			return
		}
		events, err := server.Store.ListEventsAfter(request.Context(), afterID)
		if err != nil {
			return
		}
		afterID, err = writeStreamTick(writer, events, afterID, tick)
		if err != nil || controller.Flush() != nil {
			return
		}
	}
}

// writeStreamTick writes new events. Without events, a regular comment keeps proxies from
// closing the connection.
func writeStreamTick(
	writer io.Writer, events []store.Event, afterID int64, tick int,
) (int64, error) {
	if len(events) > 0 {
		return writeStreamEvents(writer, events, afterID)
	}
	if tick%streamKeepAliveTick != 0 {
		return afterID, nil
	}
	_, err := io.WriteString(writer, ": keep-alive\n\n")
	if err != nil {
		return afterID, fmt.Errorf("write keep-alive: %w", err)
	}
	return afterID, nil
}

// findStreamStart uses `Last-Event-ID` from a reconnect, then `?since=`, then the newest event.
// Players only get recent events, so the log does not tell them who was active when.
func (server *apiServer) findStreamStart(request *http.Request, viewerID int64) (int64, error) {
	latestID, err := server.Store.LoadLatestEventID(request.Context())
	if err != nil {
		return 0, fmt.Errorf("find stream start: %w", err)
	}
	start := request.Header.Get(headerLastEventID)
	if start == "" {
		start = request.URL.Query().Get(querySince)
	}
	if start == "" {
		return latestID, nil
	}
	afterID, err := strconv.ParseInt(start, 10, 64)
	if err != nil || afterID < 0 {
		return 0, store.ErrInvalidInput
	}
	if viewerID != noViewerPlayer {
		return max(afterID, latestID-maxPlayerReplayEvents), nil
	}
	return afterID, nil
}

// writeStreamEvents writes events in SSE format and returns the ID of the last one.
func writeStreamEvents(writer io.Writer, events []store.Event, afterID int64) (int64, error) {
	for _, event := range events {
		data, err := json.Marshal(event)
		if err != nil {
			return afterID, fmt.Errorf("encode event: %w", err)
		}
		_, err = fmt.Fprintf(writer, "id: %d\nevent: %s\ndata: %s\n\n", event.ID, event.Type, data)
		if err != nil {
			return afterID, fmt.Errorf("write event: %w", err)
		}
		afterID = event.ID
	}
	return afterID, nil
}
