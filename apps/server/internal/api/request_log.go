package api

import (
	"log/slog"
	"net/http"
)

// logRequests logs every finished request at debug level. It names the route and the path but
// never the query or headers, because the stage key and secrets travel there.
func (server *apiServer) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !server.Logger.Enabled(request.Context(), slog.LevelDebug) {
			next.ServeHTTP(writer, request)
			return
		}
		startedAt := server.Now()
		recorder := &statusRecorder{ResponseWriter: writer, status: http.StatusOK}
		next.ServeHTTP(recorder, request)
		// The mux fills in Pattern on this same request while routing it.
		server.Logger.DebugContext(request.Context(), "request",
			"method", request.Method,
			"route", request.Pattern,
			"path", request.URL.Path,
			"status", recorder.status,
			"duration_ms", server.Now().Sub(startedAt).Milliseconds(),
		)
	})
}

// statusRecorder remembers the status a handler writes.
type statusRecorder struct {
	http.ResponseWriter

	status      int
	wroteHeader bool
}

// WriteHeader remembers the first status and passes it on.
func (recorder *statusRecorder) WriteHeader(status int) {
	if !recorder.wroteHeader {
		recorder.status = status
		recorder.wroteHeader = true
	}
	recorder.ResponseWriter.WriteHeader(status)
}

// Unwrap lets [http.ResponseController] reach Flush and the deadlines of streams.
func (recorder *statusRecorder) Unwrap() http.ResponseWriter {
	return recorder.ResponseWriter
}
