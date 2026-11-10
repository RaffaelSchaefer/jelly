package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const (
	actionPoke    = rules.ActionPoke
	actionEvent   = "event"
	millisPerHour = 3_600_000
	maxReportRows = 500
)

// actionContext is what every player action works with inside its transaction.
type actionContext struct {
	transaction  *sql.Tx
	lan          activeLAN
	playerID     int64
	now          int64
	restHours    int
	sessionHours int
	hidden       bool
}

// xpEntry is a new entry in the XP history.
type xpEntry struct {
	action      string
	amount      int
	eventCodeID sql.NullInt64
}

// ApplyPoke applies a poke and returns the granted XP with the new state.
func (store *Store) ApplyPoke(ctx context.Context, playerID, now int64) (int, PlayerState, error) {
	var gainedXP int
	work := func(action actionContext) error {
		lastPokeAt, err := loadLastPokeTime(ctx, action.transaction, action.lan.id, playerID)
		if err != nil {
			return err
		}
		gainedXP = rules.CalculatePokeXP(action.lan.gameRules, lastPokeAt, now)
		if gainedXP == 0 {
			return nil
		}
		return grantXP(ctx, action, xpEntry{action: actionPoke, amount: gainedXP})
	}
	state, err := store.runPlayerAction(ctx, playerID, now, true, work)
	if err != nil {
		return 0, PlayerState{}, err
	}
	return gainedXP, state, nil
}

// ApplyReport applies a food or drink report and returns the granted XP with the new state.
func (store *Store) ApplyReport(
	ctx context.Context, playerID int64, report string, now int64,
) (int, PlayerState, error) {
	var gainedXP int
	work := func(action actionContext) error {
		history, err := loadReportHistory(ctx, action.transaction, action.lan.id, playerID)
		if err != nil {
			return err
		}
		err = rules.CheckReport(action.lan.gameRules, report, history, now)
		if err != nil {
			return fmt.Errorf("check report: %w", err)
		}
		gainedXP, err = rules.FindReportXP(action.lan.gameRules, report)
		if err != nil {
			return fmt.Errorf("find report XP: %w", err)
		}
		return grantXP(ctx, action, xpEntry{action: report, amount: gainedXP})
	}
	state, err := store.runPlayerAction(ctx, playerID, now, false, work)
	if err != nil {
		return 0, PlayerState{}, err
	}
	return gainedXP, state, nil
}

// runPlayerAction runs `work` for a player of the running LAN and updates presence and
// achievements in the same transaction.
func (store *Store) runPlayerAction(
	ctx context.Context, playerID, now int64, isPoke bool, work func(actionContext) error,
) (PlayerState, error) {
	var state PlayerState
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		action, workErr := beginPlayerAction(ctx, transaction, playerID, now)
		if workErr != nil {
			return workErr
		}
		workErr = work(action)
		if workErr != nil {
			return workErr
		}
		workErr = grantNewAchievements(ctx, transaction, achievementInput{
			lan: action.lan, playerID: playerID, now: now,
			restHours: action.restHours, sessionHours: action.sessionHours, isPoke: isPoke,
		})
		if workErr != nil {
			return workErr
		}
		state, workErr = loadState(ctx, transaction, playerID, now)
		return workErr
	})
	if err != nil {
		return PlayerState{}, err
	}
	return state, nil
}

// RecordPresence keeps a jelly awake without any XP, while the app of its player runs.
func (store *Store) RecordPresence(
	ctx context.Context, playerID, now int64,
) (PlayerState, error) {
	return store.runPlayerAction(ctx, playerID, now, false, func(actionContext) error {
		return nil
	})
}

// beginPlayerAction checks the entry and refreshes the presence of the jelly.
func beginPlayerAction(
	ctx context.Context, transaction *sql.Tx, playerID, now int64,
) (actionContext, error) {
	lan, err := loadActiveLAN(ctx, transaction, now)
	if err != nil {
		return actionContext{}, err
	}
	var lastSeenAt, sessionStartedAt int64
	var hidden sql.NullInt64
	const selectPresenceSQL = `SELECT e.last_seen_at, e.session_started_at, p.hidden_at
		FROM lan_entries e JOIN players p ON p.id = e.player_id
		WHERE e.lan_id = ? AND e.player_id = ?`
	err = transaction.QueryRowContext(ctx, selectPresenceSQL, lan.id, playerID).
		Scan(&lastSeenAt, &sessionStartedAt, &hidden)
	if errors.Is(err, sql.ErrNoRows) {
		return actionContext{}, ErrNotJoined
	}
	if err != nil {
		return actionContext{}, fmt.Errorf("load entry: %w", err)
	}
	wasPresent := rules.IsPresent(lan.gameRules, lastSeenAt, now)
	if !wasPresent {
		sessionStartedAt = now
	}
	const updatePresenceSQL = `UPDATE lan_entries
		SET last_seen_at = ?, session_started_at = ? WHERE lan_id = ? AND player_id = ?`
	_, err = transaction.ExecContext(ctx, updatePresenceSQL,
		now, sessionStartedAt, lan.id, playerID)
	if err != nil {
		return actionContext{}, fmt.Errorf("update presence: %w", err)
	}
	action := actionContext{
		transaction: transaction, lan: lan, playerID: playerID, now: now,
		restHours:    int((now - lastSeenAt) / millisPerHour),
		sessionHours: int((now - sessionStartedAt) / millisPerHour),
		hidden:       hidden.Valid,
	}
	if !wasPresent {
		err = appendVisibleEvent(ctx, action, EventPlayerActive, struct{}{})
	}
	return action, err
}

// loadOtherPlayerAction builds the context for a second player in the same transaction.
func loadOtherPlayerAction(
	ctx context.Context, action actionContext, playerID int64,
) (actionContext, error) {
	hidden, err := isPlayerHidden(ctx, action.transaction, playerID)
	if err != nil {
		return actionContext{}, err
	}
	other := action
	other.playerID = playerID
	other.hidden = hidden
	other.restHours = 0
	other.sessionHours = 0
	return other, nil
}

// appendVisibleEvent writes a public player event. Hidden jellies stay off the stage.
func appendVisibleEvent(
	ctx context.Context, action actionContext, eventType string, payload any,
) error {
	if action.hidden {
		return nil
	}
	return appendEvent(ctx, action.transaction, eventRecord{
		lanID: action.lan.id, eventType: eventType, scope: scopePublic,
		playerID: action.playerID, payload: payload, now: action.now,
	})
}

// grantXP writes history and total in one transaction and announces XP and level changes.
func grantXP(ctx context.Context, action actionContext, entry xpEntry) error {
	var currentXP int
	const selectEntryXPSQL = `SELECT xp FROM lan_entries WHERE lan_id = ? AND player_id = ?`
	err := action.transaction.QueryRowContext(ctx, selectEntryXPSQL,
		action.lan.id, action.playerID).Scan(&currentXP)
	if err != nil {
		return fmt.Errorf("load XP: %w", err)
	}
	const insertXPLogSQL = `INSERT INTO xp_log
		(lan_id, player_id, action, xp, event_code_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
	_, err = action.transaction.ExecContext(ctx, insertXPLogSQL,
		action.lan.id, action.playerID, entry.action, entry.amount, entry.eventCodeID, action.now)
	if err != nil {
		return fmt.Errorf("write XP history: %w", err)
	}
	const addEntryXPSQL = `UPDATE lan_entries SET xp = xp + ? WHERE lan_id = ? AND player_id = ?`
	_, err = action.transaction.ExecContext(ctx, addEntryXPSQL,
		entry.amount, action.lan.id, action.playerID)
	if err != nil {
		return fmt.Errorf("write XP total: %w", err)
	}
	return announceXP(ctx, action, currentXP, entry)
}

// xpGainedPayload says how much XP a jelly got and for what, so a stage can react to the source.
type xpGainedPayload struct {
	Amount int    `json:"amount"`
	Source string `json:"source"`
}

// announceXP emits the XP gain and, if reached, the new level with its coins.
func announceXP(ctx context.Context, action actionContext, previousXP int, entry xpEntry) error {
	payload := xpGainedPayload{Amount: entry.amount, Source: entry.action}
	err := appendVisibleEvent(ctx, action, EventXPGained, payload)
	if err != nil {
		return err
	}
	gameRules := action.lan.gameRules
	previousLevel := rules.CalculateLevel(gameRules, previousXP)
	level := rules.CalculateLevel(gameRules, previousXP+entry.amount)
	if level == previousLevel {
		return nil
	}
	err = appendVisibleEvent(ctx, action, EventLevelUp, map[string]int{"level": level})
	if err != nil {
		return err
	}
	return grantCoins(ctx, action, coinSourceLevel,
		rules.CalculateCoinsForLevels(gameRules, level-previousLevel))
}

// loadLastPokeTime returns the last XP poke of this LAN or [rules.NoPokeYet].
func loadLastPokeTime(
	ctx context.Context, database querier, lanID, playerID int64,
) (int64, error) {
	lastPokeAt := rules.NoPokeYet
	const selectLastPokeSQL = `SELECT COALESCE(MAX(created_at), ?) FROM xp_log
		WHERE player_id = ? AND lan_id = ? AND action = ?`
	err := database.QueryRowContext(ctx, selectLastPokeSQL,
		rules.NoPokeYet, playerID, lanID, actionPoke).Scan(&lastPokeAt)
	if err != nil {
		return 0, fmt.Errorf("load last poke: %w", err)
	}
	return lastPokeAt, nil
}

// loadReportHistory returns the recent food and drink reports of this LAN.
func loadReportHistory(
	ctx context.Context, database querier, lanID, playerID int64,
) ([]rules.ReportEntry, error) {
	const selectReportsSQL = `SELECT action, created_at FROM xp_log
		WHERE player_id = ? AND lan_id = ? AND action IN (?, ?)
		ORDER BY created_at DESC LIMIT ?`
	rows, err := database.QueryContext(ctx, selectReportsSQL,
		playerID, lanID, rules.ActionFood, rules.ActionDrink, maxReportRows)
	if err != nil {
		return nil, fmt.Errorf("load reports: %w", err)
	}
	defer func() { _ = rows.Close() }()
	history := []rules.ReportEntry{}
	for rows.Next() {
		var entry rules.ReportEntry
		if err := rows.Scan(&entry.Action, &entry.At); err != nil {
			return nil, fmt.Errorf("read report: %w", err)
		}
		history = append(history, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load reports: %w", err)
	}
	return history, nil
}

// requireLANEntry returns [ErrNotJoined] if the player has not joined the LAN.
func requireLANEntry(ctx context.Context, database querier, lanID, playerID int64) error {
	var found int
	const findEntrySQL = `SELECT 1 FROM lan_entries WHERE lan_id = ? AND player_id = ?`
	err := database.QueryRowContext(ctx, findEntrySQL, lanID, playerID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotJoined
	}
	if err != nil {
		return fmt.Errorf("check entry: %w", err)
	}
	return nil
}
