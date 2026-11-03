// Package api provides the HTTP interface described in `docs/api.md`.
package api

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
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
	// partnerAttempts limits guesses of the short partner codes per player.
	partnerAttempts *playerLimiters
}

// newAPIServer creates the state that all routes share.
func newAPIServer(dependencies Dependencies) *apiServer {
	return &apiServer{
		Dependencies:    dependencies,
		attempts:        rate.NewLimiter(attemptsPerSecond, attemptBurst),
		partnerAttempts: newPlayerLimiters(),
	}
}

// NewHandler builds the HTTP handler.
func NewHandler(dependencies Dependencies) http.Handler {
	server := newAPIServer(dependencies)
	mux := http.NewServeMux()
	server.addContractRoutes(buildContractAPI(mux))
	server.addStreamRoute(mux)
	server.addHealthRoute(mux)
	server.addSessionRoutes(mux)
	server.addAdminRoutes(mux)
	if dependencies.Web != nil {
		mux.Handle("GET /", dependencies.Web)
	}
	return mux
}

// addContractRoutes registers everything the OpenAPI document describes.
func (server *apiServer) addContractRoutes(contract huma.API) {
	server.addPlayerRoutes(contract)
	server.addActionRoutes(contract)
	server.addPartnerRoutes(contract)
	server.addStageRoutes(contract)
}

// currentMillis returns the current server time in Unix milliseconds.
func (server *apiServer) currentMillis() int64 {
	return server.Now().UnixMilli()
}
