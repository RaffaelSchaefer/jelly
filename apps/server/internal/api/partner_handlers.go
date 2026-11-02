package api

import (
	"net/http"
	"sync"

	"golang.org/x/time/rate"
)

const (
	partnerAttemptsPerMinute = 10
	partnerAttemptBurst      = 5
	secondsPerMinute         = 60
)

// playerLimiters keeps one rate limiter per player, since one shared limiter would let a single
// guesser lock out everyone.
type playerLimiters struct {
	guard    sync.Mutex
	limiters map[int64]*rate.Limiter
}

// newPlayerLimiters creates an empty set of limiters.
func newPlayerLimiters() *playerLimiters {
	return &playerLimiters{guard: sync.Mutex{}, limiters: map[int64]*rate.Limiter{}}
}

// allowAttempt reports whether this player may try another code.
func (limiters *playerLimiters) allowAttempt(playerID int64) bool {
	limiters.guard.Lock()
	defer limiters.guard.Unlock()
	limiter, found := limiters.limiters[playerID]
	if !found {
		perSecond := rate.Limit(float64(partnerAttemptsPerMinute) / secondsPerMinute)
		limiter = rate.NewLimiter(perSecond, partnerAttemptBurst)
		limiters.limiters[playerID] = limiter
	}
	return limiter.Allow()
}

// addPartnerRoutes registers the partner emote flow.
func (server *apiServer) addPartnerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /partner-emote", server.requirePlayer(server.handleCreatePartnerOffer))
	mux.HandleFunc("POST /partner-emote/join", server.requirePlayer(server.handleJoinPartnerOffer))
}

// handleCreatePartnerOffer returns a code that the player tells someone else.
func (server *apiServer) handleCreatePartnerOffer(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	var body keyBody
	if !server.readJSON(writer, request, &body) {
		return
	}
	offer, err := server.Store.CreatePartnerOffer(
		request.Context(), playerID, body.Key, server.currentMillis(),
	)
	server.writeOutcome(writer, request, offer, err)
}

// handleJoinPartnerOffer plays the emote for the player who entered the code and its owner.
func (server *apiServer) handleJoinPartnerOffer(
	writer http.ResponseWriter, request *http.Request, playerID int64,
) {
	var body struct {
		Code string `json:"code"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	if !server.partnerAttempts.allowAttempt(playerID) {
		server.writeProblem(writer, problemRateLimited())
		return
	}
	result, err := server.Store.AcceptPartnerOffer(
		request.Context(), playerID, body.Code, server.currentMillis(),
	)
	server.writeOutcome(writer, request, result, err)
}
