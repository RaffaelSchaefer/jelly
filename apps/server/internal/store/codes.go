package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const eventCodeConflictMessage = "UNIQUE constraint failed: event_codes.lan_id, event_codes.code"

// NewEventCode describes an event code to create.
type NewEventCode struct {
	LANID      int64  `json:"lan_id"`
	Title      string `json:"title"`
	Code       string `json:"code"`
	XP         int    `json:"xp"`
	ValidFrom  int64  `json:"valid_from"`
	ValidUntil int64  `json:"valid_until"`
}

// EventCode is an event code as the admin page shows it.
type EventCode struct {
	ID            int64  `json:"id"`
	LANID         int64  `json:"lan_id"`
	Title         string `json:"title"`
	Code          string `json:"code"`
	XP            int    `json:"xp"`
	ValidFrom     int64  `json:"valid_from"`
	ValidUntil    int64  `json:"valid_until"`
	RedeemedCount int    `json:"redeemed_count"`
}

// redeemableCode is a valid event code of the running LAN.
type redeemableCode struct {
	id    int64
	title string
	xp    int
}

// CreateEventCode creates a timed event code. The code stays readable for admins.
func (store *Store) CreateEventCode(ctx context.Context, code NewEventCode, now int64) error {
	code.Title = strings.TrimSpace(code.Title)
	code.Code = strings.TrimSpace(code.Code)
	if code.Title == "" || code.Code == "" ||
		!rules.IsEventCodeValid(code.XP, code.ValidFrom, code.ValidUntil) {
		return ErrInvalidInput
	}
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		const insertEventCodeSQL = `INSERT INTO event_codes
			(lan_id, title, code, xp, valid_from, valid_until, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`
		_, err := transaction.ExecContext(ctx, insertEventCodeSQL,
			code.LANID, code.Title, code.Code, code.XP, code.ValidFrom, code.ValidUntil, now)
		if err != nil && strings.Contains(err.Error(), eventCodeConflictMessage) {
			return ErrEventCodeExists
		}
		if err != nil && strings.Contains(err.Error(), "FOREIGN KEY") {
			return ErrLANNotFound
		}
		if err != nil {
			return fmt.Errorf("insert event code: %w", err)
		}
		return recordAdminAction(ctx, transaction, AdminActionEventCode, code.LANID, now)
	})
}

// ListEventCodes returns all event codes of a LAN with their redemption counts.
func (store *Store) ListEventCodes(ctx context.Context, lanID int64) ([]EventCode, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	const selectEventCodesSQL = `SELECT c.id, c.lan_id, c.title, c.code, c.xp,
			c.valid_from, c.valid_until,
			(SELECT COUNT(*) FROM xp_log x WHERE x.event_code_id = c.id)
		FROM event_codes c WHERE c.lan_id = ? ORDER BY c.valid_from DESC, c.id DESC`
	rows, err := store.readDB.QueryContext(queryCtx, selectEventCodesSQL, lanID)
	if err != nil {
		return nil, fmt.Errorf("list event codes: %w", err)
	}
	defer func() { _ = rows.Close() }()
	codes := []EventCode{}
	for rows.Next() {
		var code EventCode
		err = rows.Scan(&code.ID, &code.LANID, &code.Title, &code.Code, &code.XP,
			&code.ValidFrom, &code.ValidUntil, &code.RedeemedCount)
		if err != nil {
			return nil, fmt.Errorf("read event code: %w", err)
		}
		codes = append(codes, code)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list event codes: %w", err)
	}
	return codes, nil
}

// RedeemedCode is the result of redeeming an event code.
type RedeemedCode struct {
	Title    string      `json:"title"`
	XPGained int         `json:"xp_gained"`
	Me       PlayerState `json:"me"`
}

// RedeemEventCode grants the XP of a valid code once per player.
func (store *Store) RedeemEventCode(
	ctx context.Context, playerID int64, code string, now int64,
) (RedeemedCode, error) {
	var redeemed redeemableCode
	work := func(action actionContext) error {
		var workErr error
		redeemed, workErr = findRedeemableCode(ctx, action, strings.TrimSpace(code))
		if workErr != nil {
			return workErr
		}
		workErr = grantXP(ctx, action, xpEntry{
			action: actionEvent, amount: redeemed.xp,
			eventCodeID: sql.NullInt64{Int64: redeemed.id, Valid: true},
		})
		if workErr != nil {
			return workErr
		}
		return grantFullHouse(ctx, action, redeemed.id)
	}
	state, err := store.runPlayerAction(ctx, playerID, now, false, work)
	if err != nil {
		return RedeemedCode{}, err
	}
	return RedeemedCode{Title: redeemed.title, XPGained: redeemed.xp, Me: state}, nil
}

// findRedeemableCode checks the code, its time window and earlier redemptions.
func findRedeemableCode(
	ctx context.Context, action actionContext, code string,
) (redeemableCode, error) {
	var found redeemableCode
	const findValidCodeSQL = `SELECT id, title, xp FROM event_codes
		WHERE lan_id = ? AND code = ? AND valid_from <= ? AND valid_until > ?`
	err := action.transaction.QueryRowContext(ctx, findValidCodeSQL,
		action.lan.id, code, action.now, action.now).Scan(&found.id, &found.title, &found.xp)
	if errors.Is(err, sql.ErrNoRows) {
		return redeemableCode{}, ErrEventCodeInvalid
	}
	if err != nil {
		return redeemableCode{}, fmt.Errorf("find event code: %w", err)
	}
	var redeemedCount int
	const countRedemptionsSQL = `SELECT COUNT(*) FROM xp_log
		WHERE player_id = ? AND event_code_id = ?`
	err = action.transaction.QueryRowContext(ctx, countRedemptionsSQL,
		action.playerID, found.id).Scan(&redeemedCount)
	if err != nil {
		return redeemableCode{}, fmt.Errorf("check redemption: %w", err)
	}
	if redeemedCount > 0 {
		return redeemableCode{}, ErrEventCodeRedeemed
	}
	return found, nil
}

// grantFullHouse gives Volle Bude to everyone who redeemed this code once enough players did.
func grantFullHouse(ctx context.Context, action actionContext, codeID int64) error {
	var joinedPlayers int
	const countJoinedPlayersSQL = `SELECT COUNT(*) FROM lan_entries WHERE lan_id = ?`
	err := action.transaction.QueryRowContext(ctx, countJoinedPlayersSQL,
		action.lan.id).Scan(&joinedPlayers)
	if err != nil {
		return fmt.Errorf("count players: %w", err)
	}
	redeemers, err := loadCodeRedeemers(ctx, action.transaction, codeID)
	if err != nil {
		return err
	}
	if !rules.IsFullHouse(action.lan.gameRules, len(redeemers), joinedPlayers) {
		return nil
	}
	for _, playerID := range redeemers {
		redeemer, err := loadOtherPlayerAction(ctx, action, playerID)
		if err != nil {
			return err
		}
		err = grantAchievementOnce(ctx, redeemer, rules.AchievementFullHouse)
		if err != nil {
			return err
		}
	}
	return nil
}

// loadCodeRedeemers returns everyone who redeemed an event code.
func loadCodeRedeemers(ctx context.Context, database querier, codeID int64) ([]int64, error) {
	const selectRedeemersSQL = `SELECT player_id FROM xp_log WHERE event_code_id = ?`
	rows, err := database.QueryContext(ctx, selectRedeemersSQL, codeID)
	if err != nil {
		return nil, fmt.Errorf("load redeemers: %w", err)
	}
	defer func() { _ = rows.Close() }()
	redeemers := []int64{}
	for rows.Next() {
		var playerID int64
		if err := rows.Scan(&playerID); err != nil {
			return nil, fmt.Errorf("read redeemer: %w", err)
		}
		redeemers = append(redeemers, playerID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load redeemers: %w", err)
	}
	return redeemers, nil
}
