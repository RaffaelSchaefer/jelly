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

// InviteBody asks other jellies for a partner emote.
type InviteBody struct {
	Key        string  `json:"key"`
	PartnerIDs []int64 `json:"partner_ids"`
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
			"with PATCH. `partner_ids` holds exactly one jelly for now.",
		Middlewares: huma.Middlewares{server.limitCodeAttempts},
	}, server.handleCreatePartnerInvite)
	addPlayerOperation(server, contract, huma.Operation{
		OperationID: "answerPartnerEmote", Method: http.MethodPatch, Path: pathPartnerEmotes,
		Summary: "Accept, decline or cancel a partner emote",
		Description: "The invited jelly sends `accepted` or `declined`, " +
			"the one who asked sends `cancelled`.",
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
	return answerWith(server.Store.CreatePartnerInvite(
		ctx, playerID, input.Body.Key, input.Body.PartnerIDs, server.currentMillis(),
	))
}

// handleAnswerPartnerInvite accepts, declines or cancels an invite.
func (server *apiServer) handleAnswerPartnerInvite(
	ctx context.Context, playerID int64, input *jsonInput[InviteAnswerBody],
) (*jsonOutput[store.PartnerInviteResult], error) {
	return answerWith(server.Store.AnswerPartnerInvite(
		ctx, playerID, input.Body.ID, input.Body.State, server.currentMillis(),
	))
}

// handleListPartnerInvites returns the open invites of the player.
func (server *apiServer) handleListPartnerInvites(
	ctx context.Context, playerID int64, _ *noInput,
) (*jsonOutput[store.PartnerInviteList], error) {
	return answerWith(server.Store.ListOpenPartnerInvites(ctx, playerID, server.currentMillis()))
}
