package api

import (
	"context"
	"errors"
	"math/rand/v2"
	"net/http"
	"slices"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const (
	// maxAutoBots is far more than a hall holds, so it only stops typos.
	maxAutoBots = 1000
	// A trip of a bot goes somewhere on the floor, away from the walls.
	botTripMargin = 5.0
	botTripRange  = 90.0
	// Bots build a tower up to this height, then start the next one.
	botTowerHeight = 5
)

// botList is the answer about the bots of a LAN.
type botList struct {
	Bots      []store.BotSummary `json:"bots"`
	AutoCount int64              `json:"auto_count"`
}

// botAction is what an admin lets a bot do. XP is only read for `xp`, the code only for `redeem`.
type botAction struct {
	Kind string `json:"kind"`
	XP   int    `json:"xp"`
	Code string `json:"code"`
}

// listBotRoutes returns the admin routes for bots.
func (server *apiServer) listBotRoutes() map[string]http.HandlerFunc {
	return map[string]http.HandlerFunc{
		"GET /admin/api/lans/{id}/bots":     server.handleListBots,
		"POST /admin/api/lans/{id}/bots":    server.handleCreateBots,
		"PUT /admin/api/bots/auto":          server.handleSetAutoBots,
		"POST /admin/api/bots/{id}/actions": server.handleBotAction,
		"DELETE /admin/api/bots":            server.handleDeleteBots,
	}
}

// handleListBots lists the bots of a LAN and how many of them play by themselves.
func (server *apiServer) handleListBots(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	bots, err := server.Store.ListBots(request.Context(), lanID)
	answer := botList{Bots: bots, AutoCount: server.autoBots.Load()}
	server.writeOutcome(writer, request, answer, err)
}

// handleCreateBots adds bots to a LAN.
func (server *apiServer) handleCreateBots(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	var body struct {
		Count int `json:"count"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	err := server.Store.CreateBots(request.Context(), lanID, body.Count, server.currentMillis())
	server.writeOutcome(writer, request, map[string]bool{fieldCreated: true}, err)
}

// handleSetAutoBots sets how many bots play by themselves. A restart sets it back to 0, so that
// no bots start playing at a LAN without someone asking for it.
func (server *apiServer) handleSetAutoBots(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Count int64 `json:"count"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	if body.Count < 0 || body.Count > maxAutoBots {
		server.writeError(writer, request, store.ErrInvalidInput)
		return
	}
	server.autoBots.Store(body.Count)
	server.writeJSON(writer, http.StatusOK, map[string]int64{"auto_count": body.Count})
}

// handleBotAction lets one bot act, with the same rules as a player.
func (server *apiServer) handleBotAction(writer http.ResponseWriter, request *http.Request) {
	botID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	var body botAction
	if !server.readJSON(writer, request, &body) {
		return
	}
	err := server.Store.RequireBot(request.Context(), botID)
	if err == nil {
		err = server.runBotAction(request.Context(), botID, body)
	}
	server.writeOutcome(writer, request, map[string]bool{fieldUpdated: true}, err)
}

// handleDeleteBots deletes all bots.
func (server *apiServer) handleDeleteBots(writer http.ResponseWriter, request *http.Request) {
	server.autoBots.Store(0)
	count, err := server.Store.DeleteBots(request.Context(), server.currentMillis())
	server.writeOutcome(writer, request, map[string]int{fieldDeleted: count}, err)
}

// runBotAction calls the same store functions as the routes of the players.
func (server *apiServer) runBotAction(ctx context.Context, botID int64, action botAction) error {
	now := server.currentMillis()
	var err error
	switch action.Kind {
	case rules.BotActionPoke:
		_, _, err = server.Store.ApplyPoke(ctx, botID, now)
	case rules.ActionFood, rules.ActionDrink:
		_, _, err = server.Store.ApplyReport(ctx, botID, action.Kind, now)
	case rules.BotActionEmote:
		_, err = server.Store.ApplyEmote(ctx, botID, pickCatalogKey(rules.ListEmotes()), now)
	case rules.BotActionSign:
		_, err = server.Store.UpdateSign(ctx, botID, pickCatalogKey(rules.ListSigns()), now)
	case rules.BotActionTrip:
		_, err = server.Store.StartTrip(ctx, botID, pickTripPoint(), now)
	case rules.BotActionFollow:
		err = server.followSomeone(ctx, botID, now)
	case rules.BotActionStack:
		err = server.stackSomewhere(ctx, botID, now)
	case rules.BotActionXP:
		err = server.Store.GiveXP(ctx, botID, action.XP, now)
	case rules.BotActionRedeem:
		_, err = server.Store.RedeemEventCode(ctx, botID, action.Code, now)
	case rules.BotActionPurchase:
		err = server.buySomething(ctx, botID, now)
	default:
		err = store.ErrInvalidInput
	}
	return err
}

// buySomething lets a bot buy an affordable cosmetic it does not own yet. With not enough coins
// for anything, it buys nothing, like a player would wait too.
func (server *apiServer) buySomething(ctx context.Context, botID, now int64) error {
	state, err := server.Store.LoadPlayerState(ctx, botID, now)
	if err != nil {
		return err
	}
	for _, cosmetic := range rules.ListCosmetics() {
		if cosmetic.Unlock != rules.UnlockShop {
			continue
		}
		if slices.Contains(state.Cosmetics, cosmetic.Key) || cosmetic.Price > state.Coins {
			continue
		}
		_, err = server.Store.PurchaseCosmetic(ctx, botID, cosmetic.Key, now)
		return err
	}
	return nil
}

// followSomeone lets a bot follow another jelly on the stage.
func (server *apiServer) followSomeone(ctx context.Context, botID, now int64) error {
	state, err := server.Store.LoadStageState(ctx, now)
	if err != nil {
		return err
	}
	others := slices.DeleteFunc(state.Players, func(player store.StagePlayer) bool {
		return player.ID == botID
	})
	if len(others) == 0 {
		return store.ErrInvalidFollow
	}
	target := others[pickNumber(len(others))]
	_, err = server.Store.StartFollow(ctx, botID, target.ID, now)
	return err
}

// stackSomewhere climbs the highest stack with room, or starts one where the bot stands. A stack
// too far away refuses the bot like a player, so it walks there and climbs on arrival
// ([climbReachedStacks]). A bot on a stack stays there.
func (server *apiServer) stackSomewhere(ctx context.Context, botID, now int64) error {
	state, err := server.Store.LoadStageState(ctx, now)
	if err != nil {
		return err
	}
	if isOnStack(state.Stacks, botID) {
		return nil
	}
	tower, found := pickBotTower(state.Stacks)
	if !found {
		_, err = server.startStackHere(ctx, botID, now)
		return err
	}
	_, err = server.climbStack(ctx, botID, tower.ID, now)
	if errors.Is(err, store.ErrTooFar) {
		_, err = server.Store.StartTrip(ctx, botID, rules.StagePoint{X: tower.X, Y: tower.Y}, now)
	}
	return err
}

// pickBotTower returns the highest stack below [botTowerHeight].
func pickBotTower(stacks []store.Stack) (store.Stack, bool) {
	var tower store.Stack
	found := false
	for _, stack := range stacks {
		height := len(stack.MemberIDs)
		if height < botTowerHeight && (!found || height > len(tower.MemberIDs)) {
			tower, found = stack, true
		}
	}
	return tower, found
}

// isOnStack says whether a jelly stands on one of the stacks.
func isOnStack(stacks []store.Stack, playerID int64) bool {
	return slices.ContainsFunc(stacks, func(stack store.Stack) bool {
		return slices.Contains(stack.MemberIDs, playerID)
	})
}

// climbReachedStacks lets every bot on a trip to the point of a stack climb it once it stands
// close enough. A trip to a stack that is full or high enough ends, because it would end inside
// the tower. When the stack is gone, the trip goes on like any other.
func (server *apiServer) climbReachedStacks(
	ctx context.Context, state store.StageState, now int64,
) error {
	if len(state.Stacks) == 0 {
		return nil
	}
	gameRules, err := server.Store.LoadCurrentRules(ctx, now)
	if err != nil {
		return err
	}
	for _, player := range state.Players {
		if !player.IsBot || player.Trip == nil {
			continue
		}
		tower, found := findStackAt(state.Stacks, *player.Trip)
		if !found {
			continue
		}
		height := len(tower.MemberIDs)
		if height >= botTowerHeight || rules.IsStackFull(gameRules, height) {
			_, err = server.Store.EndTrip(ctx, player.ID, now)
			server.logBotError(ctx, rules.BotActionStack, err)
			continue
		}
		point := movement.Point{X: tower.X, Y: tower.Y}
		distance, known := server.planner.MeasureDistanceTo(player.ID, point, now)
		if known && distance <= gameRules.NearDistance {
			_, err = server.climbStack(ctx, player.ID, tower.ID, now)
			server.logBotError(ctx, rules.BotActionStack, err)
		}
	}
	return nil
}

// findStackAt returns the stack at the point of a trip.
func findStackAt(stacks []store.Stack, trip store.Trip) (store.Stack, bool) {
	index := slices.IndexFunc(stacks, func(stack store.Stack) bool {
		return stack.X == trip.X && stack.Y == trip.Y
	})
	if index < 0 {
		return store.Stack{}, false
	}
	return stacks[index], true
}

// playBots lets the automatic bots act now and then. It runs in the tick of the movement, so
// that the server keeps a single long-running goroutine.
func (server *apiServer) playBots(ctx context.Context) {
	count := server.autoBots.Load()
	if count == 0 {
		return
	}
	now := server.currentMillis()
	bots, err := server.Store.ListRunningBots(ctx, now)
	if err != nil {
		server.Logger.WarnContext(ctx, "list bots", "error", err)
		return
	}
	state, err := server.Store.LoadStageState(ctx, now)
	if err == nil {
		err = server.climbReachedStacks(ctx, state, now)
	}
	if err != nil && ctx.Err() == nil {
		server.Logger.WarnContext(ctx, "climb reached stacks", "error", err)
	}
	for _, bot := range bots[:min(len(bots), int(count))] {
		if pickNumber(rules.BotActionOdds) != 0 {
			continue
		}
		kind := rules.ChooseBotAction(pickNumber(rules.CountBotChoices()))
		// A bot stays on its stack until it falls apart, so that towers can grow.
		isWalking := kind == rules.BotActionTrip || kind == rules.BotActionFollow
		if isWalking && isOnStack(state.Stacks, bot.ID) {
			continue
		}
		// Cooldowns and limits refuse many actions, which is how a player would fare too.
		err = server.runBotAction(ctx, bot.ID, botAction{Kind: kind, XP: 0, Code: ""})
		server.logBotError(ctx, kind, err)
	}
}

// logBotError notes a refused bot action. It is no fault of the server.
func (server *apiServer) logBotError(ctx context.Context, kind string, err error) {
	if err != nil && ctx.Err() == nil {
		server.Logger.DebugContext(ctx, "bot action", "kind", kind, "error", err)
	}
}

// pickCatalogKey picks a random entry of a catalog list.
func pickCatalogKey(entries []rules.CatalogEntry) string {
	return entries[pickNumber(len(entries))].Key
}

// pickTripPoint picks a point on the floor. A point on an obstacle is refused like a player's.
func pickTripPoint() rules.StagePoint {
	return rules.StagePoint{
		X: botTripMargin + pickFraction()*botTripRange,
		Y: botTripMargin + pickFraction()*botTripRange,
	}
}

// pickNumber returns a number from 0 up to below `limit`. Bot behavior needs no secure randomness.
func pickNumber(limit int) int {
	return rand.N(limit) //nolint:gosec // See the comment above.
}

// pickFraction returns a number from 0 up to below 1.
func pickFraction() float64 {
	return rand.Float64() //nolint:gosec // See pickNumber.
}
