package api

import (
	"context"
	"net/http"
	"sync"

	"github.com/danielgtaylor/huma/v2"
	"golang.org/x/time/rate"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
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
func (server *apiServer) addPartnerRoutes(contract huma.API) {
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "createPartnerEmote", Method: http.MethodPost, Path: "/partner-emote",
		Summary: "Start a partner emote and get a code to tell someone",
	}, server.handleCreatePartnerOffer)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "joinPartnerEmote", Method: http.MethodPost, Path: "/partner-emote/join",
		Summary: "Join a partner emote with its code",
	}, server.handleJoinPartnerOffer)
}

// handleCreatePartnerOffer returns a code that the player tells someone else.
func (server *apiServer) handleCreatePartnerOffer(
	ctx context.Context, playerID int64, input *jsonInput[KeyBody],
) (*jsonOutput[store.PartnerOffer], error) {
	return answerWith(
		server.Store.CreatePartnerOffer(ctx, playerID, input.Body.Key, server.currentMillis()),
	)
}

// handleJoinPartnerOffer plays the emote for the player who entered the code and its owner.
func (server *apiServer) handleJoinPartnerOffer(
	ctx context.Context, playerID int64, input *jsonInput[CodeBody],
) (*jsonOutput[store.PartnerResult], error) {
	if !server.partnerAttempts.allowAttempt(playerID) {
		return nil, errRateLimited
	}
	return answerWith(
		server.Store.AcceptPartnerOffer(ctx, playerID, input.Body.Code, server.currentMillis()),
	)
}
