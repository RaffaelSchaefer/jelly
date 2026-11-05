package api

import (
	"context"
	"net/http"
	"sync"

	"github.com/danielgtaylor/huma/v2"
	"golang.org/x/time/rate"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const secondsPerMinute = 60

// pathPartnerEmotes is the topic of partner emote invites.
const pathPartnerEmotes = "/partner-emotes"

// playerLimiters keeps one rate limiter per player, since one shared limiter would let a single
// guesser lock out everyone.
type playerLimiters struct {
	guard     sync.Mutex
	limiters  map[int64]*rate.Limiter
	perMinute int
	burst     int
}

// newPlayerLimiters creates an empty set of limiters with these limits.
func newPlayerLimiters(perMinute, burst int) *playerLimiters {
	return &playerLimiters{
		guard: sync.Mutex{}, limiters: map[int64]*rate.Limiter{},
		perMinute: perMinute, burst: burst,
	}
}

// allowAttempt reports whether this player may try again.
func (limiters *playerLimiters) allowAttempt(playerID int64) bool {
	limiters.guard.Lock()
	defer limiters.guard.Unlock()
	limiter, found := limiters.limiters[playerID]
	if !found {
		perSecond := rate.Limit(float64(limiters.perMinute) / secondsPerMinute)
		limiter = rate.NewLimiter(perSecond, limiters.burst)
		limiters.limiters[playerID] = limiter
	}
	return limiter.Allow()
}

// InviteBody asks another jelly for a partner emote.
type InviteBody struct {
	Key       string `json:"key"`
	PartnerID int64  `json:"partner_id"`
}

// InviteAnswerBody accepts, declines or cancels an invite.
type InviteAnswerBody struct {
	ID    int64  `json:"id"`
	State string `json:"state"`
}

// addPartnerRoutes registers the partner emote flow.
func (server *apiServer) addPartnerRoutes(contract huma.API) {
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "createPartnerEmote", Method: http.MethodPost, Path: pathPartnerEmotes,
		Summary: "Ask another jelly for a partner emote",
		Description: "The other client learns about it from `partner_emote.updated` and answers " +
			"with PATCH. Jellies further apart " +
			"than `near_distance` get `409 too_far`.",
		Middlewares: huma.Middlewares{server.limitCodeAttempts},
	}, server.handleCreatePartnerInvite)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "answerPartnerEmote", Method: http.MethodPatch, Path: pathPartnerEmotes,
		Summary: "Accept, decline or cancel a partner emote",
		Description: "The invited jelly sends `accepted` or `declined`, " +
			"the one who asked sends `cancelled`. Accepting further apart than `near_distance` " +
			"gets `409 too_far`, and the invite stays open.",
	}, server.handleAnswerPartnerInvite)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "listPartnerEmotes", Method: http.MethodGet, Path: pathPartnerEmotes,
		Summary: "Read the own open partner emotes, for example after a restart",
	}, server.handleListPartnerInvites)
}

// handleCreatePartnerInvite asks another jelly for a partner emote.
func (server *apiServer) handleCreatePartnerInvite(
	ctx context.Context, playerID int64, input *jsonInput[InviteBody],
) (*jsonOutput[store.PartnerInviteResult], error) {
	now := server.currentMillis()
	server.refreshMovement(ctx, now)
	return answerWith(server.Store.CreatePartnerInvite(ctx, store.NewPartnerInvite{
		PlayerID: playerID, EmoteKey: input.Body.Key, PartnerID: input.Body.PartnerID, Now: now,
		IsNear: server.buildNearCheck(playerID, now),
	}))
}

// handleAnswerPartnerInvite accepts, declines or cancels an invite.
func (server *apiServer) handleAnswerPartnerInvite(
	ctx context.Context, playerID int64, input *jsonInput[InviteAnswerBody],
) (*jsonOutput[store.PartnerInviteResult], error) {
	now := server.currentMillis()
	server.refreshMovement(ctx, now)
	return answerWith(server.Store.AnswerPartnerInvite(ctx, store.PartnerInviteAnswer{
		PlayerID: playerID, InviteID: input.Body.ID, State: input.Body.State, Now: now,
		IsNear: server.buildNearCheck(playerID, now),
	}))
}

// buildNearCheck returns a check of the distance to this jelly right now. A jelly that is not on
// the stage counts as too far away.
func (server *apiServer) buildNearCheck(
	playerID, now int64,
) func(partnerID int64, reach float64) bool {
	return func(partnerID int64, reach float64) bool {
		distance, ok := server.planner.MeasureDistance(playerID, partnerID, now)
		return ok && distance <= reach
	}
}

// handleListPartnerInvites returns the open invites of the player.
func (server *apiServer) handleListPartnerInvites(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[store.PartnerInviteList], error) {
	return answerWith(server.Store.ListOpenPartnerInvites(ctx, playerID, server.currentMillis()))
}
