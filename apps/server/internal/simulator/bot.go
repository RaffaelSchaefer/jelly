package simulator

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
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

// apiPrefix is the version of the API that the simulator speaks.
const apiPrefix = "/v1"

// Field names and paths of the API.
const (
	fieldCode     = "code"
	fieldKey      = "key"
	fieldKind     = "kind"
	pathPokes     = apiPrefix + "/pokes"
	pathReports   = apiPrefix + "/reports"
	pathEmote     = apiPrefix + "/emotes"
	pathFollow    = apiPrefix + "/trips/follow"
	pathTrip      = apiPrefix + "/trips/current"
	pathSign      = apiPrefix + "/signs/current"
	pathState     = apiPrefix + "/stage"
	pathRegister  = apiPrefix + "/register"
	pathOffer     = apiPrefix + "/partner-emote"
	pathJoinOffer = apiPrefix + "/partner-emote/join"
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
	client   apiClient
	board    *offerBoard
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
	return []string{"wave", "dance", "cheer", "laugh", "sleep", "love"}
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
		Token string `json:"token"`
		Me    struct {
			ID int64 `json:"id"`
		} `json:"me"`
	}
	for attempt := 0; ; attempt++ {
		status, err := player.postForAnswer(ctx, pathRegister, body, &answer)
		if err != nil {
			return err
		}
		if status == http.StatusCreated {
			player.token = answer.Token
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

// changeFollow stands next to a random other jelly from the stage, or walks away.
func (player *bot) changeFollow(ctx context.Context) (int, error) {
	if pickNumber(followChoices) == 0 {
		return player.remove(ctx, pathTrip)
	}
	var stage struct {
		Players []struct {
			ID int64 `json:"id"`
		} `json:"players"`
	}
	status, err := player.get(ctx, pathState, &stage)
	if err != nil || status != http.StatusOK {
		return status, err
	}
	others := make([]int64, 0, len(stage.Players))
	for _, other := range stage.Players {
		if other.ID != player.playerID {
			others = append(others, other.ID)
		}
	}
	if len(others) == 0 {
		return status, nil
	}
	target := others[pickNumber(len(others))]
	return player.post(ctx, pathFollow, map[string]int64{"player_id": target})
}

// doPartnerEmote enters the code of another bot, or leaves a new one if none is waiting.
func (player *bot) doPartnerEmote(ctx context.Context) (int, error) {
	offer, found := player.board.takeOffer(player.index, player.config.Now().UnixMilli())
	if found {
		return player.enterOffer(ctx, offer)
	}
	var answer struct {
		Code      string `json:"code"`
		ExpiresAt int64  `json:"expires_at"`
	}
	body := map[string]string{fieldKey: pickKey(listPartnerEmotes())}
	status, err := player.postForAnswer(ctx, pathOffer, body, &answer)
	if err == nil && status == http.StatusOK {
		player.board.addOffer(partnerOffer{
			code: answer.Code, botIndex: player.index, expiresAt: answer.ExpiresAt,
		})
	}
	return status, err
}

// enterOffer sends a code. A limited attempt never reached the code, so another bot can try it.
func (player *bot) enterOffer(ctx context.Context, offer partnerOffer) (int, error) {
	status, err := player.post(ctx, pathJoinOffer, map[string]string{fieldCode: offer.code})
	if err == nil && status == http.StatusTooManyRequests {
		player.board.returnOffer(offer)
	}
	return status, err
}
