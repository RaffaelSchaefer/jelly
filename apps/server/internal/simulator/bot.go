package simulator

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand/v2"
	"net/http"
	"slices"
	"sync"
	"time"
)

// Weights of the bot actions. A poke is the most common action of a real player.
const (
	weightPoke    = 35
	weightReport  = 10
	weightEmote   = 20
	weightSign    = 10
	weightFollow  = 10
	weightPartner = 15
)

// Everything a bot can do.
const (
	actionPoke    = "poke"
	actionReport  = "report"
	actionEmote   = "emote"
	actionSign    = "sign"
	actionFollow  = "follow"
	actionPartner = "partner"
)

const (
	// noJelly marks that the stage has no other jelly yet.
	noJelly        int64 = 0
	inviteAccepted       = "accepted"
)

// apiPrefix is the version of the API that the simulator speaks.
const apiPrefix = "/v1"

// Field names and paths of the API.
const (
	fieldCode    = "code"
	fieldKey     = "key"
	fieldKind    = "kind"
	pathPokes    = apiPrefix + "/pokes"
	pathReports  = apiPrefix + "/reports"
	pathEmote    = apiPrefix + "/emotes"
	pathFollow   = apiPrefix + "/trips/follow"
	pathTrip     = apiPrefix + "/trips/current"
	pathSign     = apiPrefix + "/signs/current"
	pathState    = apiPrefix + "/stage"
	pathRegister = apiPrefix + "/auth/redeem"
	pathInvites  = apiPrefix + "/partner-emotes"
)

const (
	// One in this many sign changes raises a sign, the others lower it.
	signChoices = 2
	// One in this many follow changes walks away, the others stand next to someone.
	followChoices = 3

	registerRetryStart = 250 * time.Millisecond
	registerRetryLimit = 5 * time.Second
)

// errRegisterRejected reports a registration the server will not accept on a retry.
var errRegisterRejected = errors.New("server rejected the registration")

// bot is one simulated player.
type bot struct {
	client       apiClient
	streamClient apiClient
	// streams awaits the event stream of the bot together with all bots.
	streams  *sync.WaitGroup
	results  *counters
	config   Config
	index    int
	playerID int64
	token    string
}

// listColors returns the colors a player can choose.
func listColors() []string {
	return []string{"mint", "lilac", "peach"}
}

// listEmotes returns the emotes the bots use.
func listEmotes() []string {
	return []string{
		"wave",
		"dance",
		"cheer",
		"laugh",
		"sleep",
		"love",
		"shrug",
		"point",
		"think",
		"angry",
		"sad",
		"shy",
	}
}

// listPartnerEmotes returns the partner emotes the bots use.
func listPartnerEmotes() []string {
	return []string{"hop", "spin", "wiggle"}
}

// listSigns returns the signs the bots use.
func listSigns() []string {
	return []string{"any", "cs2", "lol", "minecraft"}
}

// listReports returns what the bots report.
func listReports() []string {
	return []string{"food", "drink"}
}

// chooseAction maps a roll from 0 to [totalWeight] - 1 to an action.
func chooseAction(roll int) string {
	entries := []struct {
		action string
		weight int
	}{
		{actionPoke, weightPoke},
		{actionReport, weightReport},
		{actionEmote, weightEmote},
		{actionSign, weightSign},
		{actionFollow, weightFollow},
		{actionPartner, weightPartner},
	}
	for _, entry := range entries {
		if roll < entry.weight {
			return entry.action
		}
		roll -= entry.weight
	}
	return actionPoke
}

// totalWeight is the sum of all action weights.
func totalWeight() int {
	return weightPoke + weightReport + weightEmote + weightSign + weightFollow + weightPartner
}

// pickNumber returns a number from 0 to `limit` - 1.
func pickNumber(limit int) int {
	return rand.N(limit) //nolint:gosec // Bot behavior needs no secure randomness.
}

// pickKey returns a random entry of a fixed list.
func pickKey(keys []string) string {
	return keys[pickNumber(len(keys))]
}

// calculateRegisterRetry doubles the wait per attempt up to a limit. Adding up to the same time
// again at random keeps the bots from all returning at once.
func calculateRegisterRetry(attempt int, jitter func(int) int) time.Duration {
	delay := registerRetryStart
	for range attempt {
		delay = min(delay+delay, registerRetryLimit)
	}
	return delay + time.Duration(jitter(int(delay)))
}

// play registers the bot and acts until `ctx` ends.
func (player *bot) play(ctx context.Context) error {
	err := player.register(ctx)
	if err != nil {
		return err
	}
	if player.config.Streams {
		token := player.token
		// Concurrency plan: started once per bot after its registration, ends when ctx ends and
		// is awaited with all bots in Run. A dropped stream is counted and opened again.
		player.streams.Go(func() {
			path := buildPlayerPath(player.config.StreamTopics)
			player.streamClient.watchStream(ctx, path, token, player.results)
		})
	}
	for {
		err = waitFor(ctx, player.pickDelay())
		if err != nil {
			return err
		}
		startedAt := player.config.Now()
		status, actErr := player.act(ctx, chooseAction(pickNumber(totalWeight())))
		if actErr == nil {
			player.results.recordLatency(player.config.Now().Sub(startedAt))
		}
		player.count(status, actErr)
	}
}

// pickDelay returns a random time until the next action.
func (player *bot) pickDelay() time.Duration {
	spread := player.config.MaxDelay - player.config.MinDelay
	if spread == 0 {
		return player.config.MinDelay
	}
	return player.config.MinDelay + time.Duration(pickNumber(int(spread)))
}

// waitFor sleeps unless `ctx` ends first.
func waitFor(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return fmt.Errorf("stop waiting: %w", ctx.Err())
	case <-timer.C:
		return nil
	}
}

// count sorts the outcome of an action into the statistics.
func (player *bot) count(status int, err error) {
	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
	case err != nil:
		player.results.failed.Add(1)
	case status >= http.StatusInternalServerError:
		player.results.failed.Add(1)
	case status >= http.StatusBadRequest:
		player.results.rejected.Add(1)
	default:
		player.results.accepted.Add(1)
	}
}

// register creates the account. Only a rate limit is worth retrying.
func (player *bot) register(ctx context.Context) error {
	colors := listColors()
	body := map[string]string{
		fieldCode: player.config.JoinCode,
		"name":    fmt.Sprintf("Sim-%s-%d", player.config.RunID, player.index),
		"color":   colors[player.index%len(colors)],
	}
	var answer struct {
		Secret string `json:"secret"`
		Me     struct {
			ID int64 `json:"id"`
		} `json:"me"`
	}
	for attempt := 0; ; attempt++ {
		status, err := player.postForAnswer(ctx, pathRegister, body, &answer)
		if err != nil {
			return err
		}
		if status == http.StatusOK {
			player.token = answer.Secret
			player.playerID = answer.Me.ID
			return nil
		}
		if status != http.StatusTooManyRequests {
			return fmt.Errorf("%w: status %d", errRegisterRejected, status)
		}
		err = waitFor(ctx, calculateRegisterRetry(attempt, pickNumber))
		if err != nil {
			return err
		}
	}
}

// act sends one action and returns its HTTP status.
func (player *bot) act(ctx context.Context, action string) (int, error) {
	switch action {
	case actionReport:
		return player.post(ctx, pathReports, map[string]string{fieldKind: pickKey(listReports())})
	case actionEmote:
		return player.post(ctx, pathEmote, map[string]string{fieldKey: pickKey(listEmotes())})
	case actionSign:
		return player.changeSign(ctx)
	case actionFollow:
		return player.changeFollow(ctx)
	case actionPartner:
		return player.doPartnerEmote(ctx)
	default:
		return player.post(ctx, pathPokes, nil)
	}
}

// post sends a body and ignores the answer.
func (player *bot) post(ctx context.Context, path string, body any) (int, error) {
	return player.client.send(ctx, apiCall{
		method: http.MethodPost, path: path, token: player.token, body: body,
	})
}

// postForAnswer sends a body and reads the answer into `target`.
func (player *bot) postForAnswer(
	ctx context.Context, path string, body, target any,
) (int, error) {
	return player.client.send(ctx, apiCall{
		method: http.MethodPost, path: path, token: player.token, body: body, target: target,
	})
}

// patch sends a change.
func (player *bot) patch(ctx context.Context, path string, body any) (int, error) {
	return player.client.send(ctx, apiCall{
		method: http.MethodPatch, path: path, token: player.token, body: body,
	})
}

// put sends a body that replaces a value.
func (player *bot) put(ctx context.Context, path string, body any) (int, error) {
	return player.client.send(ctx, apiCall{
		method: http.MethodPut, path: path, token: player.token, body: body,
	})
}

// remove clears a value.
func (player *bot) remove(ctx context.Context, path string) (int, error) {
	return player.client.send(ctx, apiCall{
		method: http.MethodDelete, path: path, token: player.token,
	})
}

// get reads an answer into `target`.
func (player *bot) get(ctx context.Context, path string, target any) (int, error) {
	return player.client.send(ctx, apiCall{
		method: http.MethodGet, path: path, token: player.token, target: target,
	})
}

// changeSign raises a random sign or lowers the current one.
func (player *bot) changeSign(ctx context.Context) (int, error) {
	if pickNumber(signChoices) == 0 {
		return player.put(ctx, pathSign, map[string]string{fieldKey: pickKey(listSigns())})
	}
	return player.remove(ctx, pathSign)
}

// changeFollow follows a random other jelly from the stage, or goes back.
func (player *bot) changeFollow(ctx context.Context) (int, error) {
	if pickNumber(followChoices) == 0 {
		return player.remove(ctx, pathTrip)
	}
	target, status, err := player.pickOtherJelly(ctx)
	if err != nil || target == noJelly {
		return status, err
	}
	return player.post(ctx, pathFollow, map[string]int64{"player_id": target})
}

// pickOtherJelly returns a random other jelly from the stage, if there is one.
func (player *bot) pickOtherJelly(ctx context.Context) (int64, int, error) {
	var stage struct {
		Players []struct {
			ID int64 `json:"id"`
		} `json:"players"`
	}
	status, err := player.get(ctx, pathState, &stage)
	if err != nil || status != http.StatusOK {
		return noJelly, status, err
	}
	others := make([]int64, 0, len(stage.Players))
	for _, other := range stage.Players {
		if other.ID != player.playerID {
			others = append(others, other.ID)
		}
	}
	if len(others) == 0 {
		return noJelly, status, nil
	}
	return others[pickNumber(len(others))], status, nil
}

// pickNearbyJelly returns the jelly closest to this one, because partner emotes need nearness.
func (player *bot) pickNearbyJelly(ctx context.Context) (int64, int, error) {
	var stage struct {
		Moves []stageMove `json:"moves"`
	}
	status, err := player.get(ctx, pathState, &stage)
	if err != nil || status != http.StatusOK {
		return noJelly, status, err
	}
	own := slices.IndexFunc(stage.Moves, func(move stageMove) bool {
		return move.PlayerID == player.playerID
	})
	if own < 0 {
		return noJelly, status, nil
	}
	closest, shortest := noJelly, math.Inf(1)
	for _, other := range stage.Moves {
		distance := other.measureTo(stage.Moves[own])
		if other.PlayerID != player.playerID && distance < shortest {
			closest, shortest = other.PlayerID, distance
		}
	}
	return closest, status, nil
}

// stageMove is the part of a move that tells where a jelly is heading.
type stageMove struct {
	PlayerID int64 `json:"player_id"`
	Points   []struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	} `json:"points"`
}

// measureTo returns how far apart the ends of two moves are, in percent of the stage.
func (move stageMove) measureTo(other stageMove) float64 {
	end, otherEnd := move.Points[len(move.Points)-1], other.Points[len(other.Points)-1]
	return math.Hypot(end.X-otherEnd.X, end.Y-otherEnd.Y)
}

// doPartnerEmote accepts an invite that waits for this bot, or asks another jelly.
func (player *bot) doPartnerEmote(ctx context.Context) (int, error) {
	var open struct {
		Items []struct {
			ID        int64 `json:"id"`
			PartnerID int64 `json:"partner_id"`
		} `json:"items"`
	}
	status, err := player.get(ctx, pathInvites, &open)
	if err != nil || status != http.StatusOK {
		return status, err
	}
	for _, invite := range open.Items {
		if invite.PartnerID == player.playerID {
			return player.patch(ctx, pathInvites, map[string]any{
				"id": invite.ID, "state": inviteAccepted,
			})
		}
	}
	target, status, err := player.pickNearbyJelly(ctx)
	if err != nil || target == noJelly {
		return status, err
	}
	return player.post(ctx, pathInvites, map[string]any{
		fieldKey: pickKey(listPartnerEmotes()), "partner_id": target,
	})
}
