// Package api provides the HTTP interface described in `docs/api.md`.
package api

import (
	"log/slog"
	"net/http"
	"time"

	"golang.org/x/time/rate"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const (
	attemptsPerSecond = 10
	attemptBurst      = 100
)

// Dependencies are everything the handlers need. `Now` is their only source of time.
type Dependencies struct {
	Store       *store.Store
	Now         func() time.Time
	Logger      *slog.Logger
	StageKey    string
	AdminSecret string
	// IsStopping tells long-running streams to end, so a shutdown does not wait for them.
	IsStopping func() bool
	// Web serves the stage, admin and test pages.
	Web http.Handler
}

// apiServer holds the dependencies of the handlers.
type apiServer struct {
	Dependencies

	// attempts limits guesses of join codes, event codes and the admin secret.
	attempts *rate.Limiter
}

// NewHandler builds the HTTP handler.
func NewHandler(dependencies Dependencies) http.Handler {
	server := &apiServer{
		Dependencies: dependencies,
		attempts:     rate.NewLimiter(attemptsPerSecond, attemptBurst),
	}
	mux := http.NewServeMux()
	server.addPlayerRoutes(mux)
	server.addStageRoutes(mux)
	server.addSessionRoutes(mux)
	server.addAdminRoutes(mux)
	if dependencies.Web != nil {
		mux.Handle("GET /", dependencies.Web)
	}
	return mux
}

// currentMillis returns the current server time in Unix milliseconds.
func (server *apiServer) currentMillis() int64 {
	return server.Now().UnixMilli()
}
