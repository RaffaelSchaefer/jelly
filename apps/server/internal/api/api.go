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
	registrationsPerSecond  = 10
	registrationBurst       = 100
	loginsPerSecond         = 1
	loginBurst              = 10
	codeAttemptsPerMinute   = 10
	codeAttemptBurst        = 5
	playerRequestsPerMinute = 300
	playerRequestBurst      = 60
)

// Dependencies are everything the handlers need. `Now` is the source of all game times.
type Dependencies struct {
	Store       *store.Store
	Now         func() time.Time
	Logger      *slog.Logger
	StageKey    string
	AdminSecret string
	// MinClientVersion is the oldest app that still works. Empty means no minimum.
	MinClientVersion string
	// IsStopping tells long-running streams to end, so a shutdown does not wait for them.
	IsStopping func() bool
	// Web serves the stage, admin and test pages.
	Web http.Handler
}

// apiServer holds the dependencies of the handlers.
type apiServer struct {
	Dependencies

	// registrations limits new accounts. Nobody is known yet, so one limit is shared by all.
	registrations *rate.Limiter
	// logins limits guesses of the admin secret and cannot be used up through other routes.
	logins *rate.Limiter
	// codeAttempts limits guesses of join, event and partner codes per player.
	codeAttempts *playerLimiters
	// playerRequests keeps one script from slowing the database down for everyone.
	playerRequests *playerLimiters
	// streams limits the open event streams.
	streams *streamSlots
}

// newAPIServer creates the state that all routes share.
func newAPIServer(dependencies Dependencies) *apiServer {
	return &apiServer{
		Dependencies:   dependencies,
		registrations:  rate.NewLimiter(registrationsPerSecond, registrationBurst),
		logins:         rate.NewLimiter(loginsPerSecond, loginBurst),
		codeAttempts:   newPlayerLimiters(codeAttemptsPerMinute, codeAttemptBurst),
		playerRequests: newPlayerLimiters(playerRequestsPerMinute, playerRequestBurst),
		streams:        newStreamSlots(),
	}
}

// NewHandler builds the HTTP handler.
func NewHandler(dependencies Dependencies) http.Handler {
	server := newAPIServer(dependencies)
	mux := http.NewServeMux()
	contract := buildContractAPI(mux)
	server.addContractRoutes(contract)
	finishContract(contract)
	server.addStreamRoute(mux)
	mux.HandleFunc(versionPrefix+"/", func(writer http.ResponseWriter, _ *http.Request) {
		server.writeProblem(writer, problemNotFound())
	})
	server.addHealthRoute(mux)
	server.addSessionRoutes(mux)
	server.addAdminRoutes(mux)
	if dependencies.Web != nil {
		// Without a method, so that it does not collide with the catch-all of the version above.
		mux.Handle("/", dependencies.Web)
	}
	return mux
}

// addContractRoutes registers everything the OpenAPI document describes.
func (server *apiServer) addContractRoutes(contract huma.API) {
	server.addLANRoutes(contract)
	server.addPlayerRoutes(contract)
	server.addActionRoutes(contract)
	server.addPartnerRoutes(contract)
	server.addStageRoutes(contract)
}

// currentMillis returns the current server time in Unix milliseconds.
func (server *apiServer) currentMillis() int64 {
	return server.Now().UnixMilli()
}
