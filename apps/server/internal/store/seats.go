package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// noPlayer marks a seat without an account yet.
const noPlayer int64 = 0

// SeatCode is the registration code of a seat, as the admin map shows it.
type SeatCode struct {
	AreaID   int64   `json:"area_id"`
	Code     string  `json:"code"`
	UsedAt   *int64  `json:"used_at"`
	PlayerID *int64  `json:"player_id"`
	Name     *string `json:"name"`
}

// RedeemRequest holds a code. Name and color only count if the code creates a new account.
type RedeemRequest struct {
	Code  string
	Name  string
	Color string
}

// redemption is one exchange of a code for a secret.
type redemption struct {
	lan     activeLAN
	request RedeemRequest
	secret  string
	now     int64
}

// seatClaim is what a seat code leads to.
type seatClaim struct {
	areaID   int64
	playerID int64
	isUsed   bool
}

// RedeemCode exchanges a code for a new secret. A seat code creates an account on that seat or
// brings back the account it belongs to, whose old secret stops working. The shared code of a LAN
// always creates an account without a seat, also before or after that LAN.
func (store *Store) RedeemCode(
	ctx context.Context, request RedeemRequest, now int64,
) (string, PlayerState, error) {
	secret := generateToken()
	var state PlayerState
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		item := redemption{lan: activeLAN{}, request: request, secret: secret, now: now}
		playerID, workErr := redeemForPlayer(ctx, transaction, item)
		if workErr != nil {
			return workErr
		}
		state, workErr = loadState(ctx, transaction, playerID, now)
		return workErr
	})
	if err != nil {
		return "", PlayerState{}, err
	}
	return secret, state, nil
}

// redeemForPlayer tells seat codes, which need a running LAN, from the shared code of a LAN.
func redeemForPlayer(ctx context.Context, transaction *sql.Tx, item redemption) (int64, error) {
	lan, err := loadActiveLAN(ctx, transaction, item.now)
	if errors.Is(err, ErrNoActiveLAN) {
		return redeemLANCode(ctx, transaction, item)
	}
	if err != nil {
		return 0, err
	}
	item.lan = lan
	claim, found, err := findSeatClaim(ctx, transaction, lan.id, item.request.Code)
	if err != nil {
		return 0, err
	}
	if !found {
		return redeemLANCode(ctx, transaction, item)
	}
	return redeemSeatCode(ctx, transaction, item, claim)
}

// redeemSeatCode creates or brings back the account of a seat and places it there.
func redeemSeatCode(
	ctx context.Context, transaction *sql.Tx, item redemption, claim seatClaim,
) (int64, error) {
	if claim.isUsed {
		return 0, ErrCodeRedeemed
	}
	var err error
	playerID := claim.playerID
	if playerID == noPlayer {
		playerID, err = createAccount(ctx, transaction, item)
		if err == nil {
			err = insertLANEntry(ctx, transaction, item.lan, playerID, item.now)
		}
	} else {
		err = restoreAccount(ctx, transaction, item, playerID)
	}
	if err != nil {
		return 0, err
	}
	return playerID, placeOnSeat(ctx, transaction, item, claim.areaID, playerID)
}

// redeemLANCode creates an account with the shared code of a LAN. Before the LAN starts, the
// account is registered for it and can already get a seat. After the LAN it only gets the account.
func redeemLANCode(ctx context.Context, transaction *sql.Tx, item redemption) (int64, error) {
	codeLAN, period, err := findLANByCode(ctx, transaction, item.request.Code)
	if err != nil {
		return 0, err
	}
	playerID, err := createAccount(ctx, transaction, item)
	if err != nil {
		return 0, err
	}
	switch {
	case item.now < period.StartsAt:
		return playerID, insertFutureEntry(ctx, transaction, codeLAN, playerID, item.now)
	case item.now < period.EndsAt:
		return playerID, insertLANEntry(ctx, transaction, codeLAN, playerID, item.now)
	default:
		return playerID, nil
	}
}

// findLANByCode returns the newest LAN with this shared code.
func findLANByCode(
	ctx context.Context, transaction *sql.Tx, code string,
) (activeLAN, LANPeriod, error) {
	var lan activeLAN
	var period LANPeriod
	var rulesJSON string
	const selectLANByCodeSQL = `SELECT id, timezone, rules, starts_at, ends_at FROM lans
		WHERE join_code_hash = ? ORDER BY starts_at DESC LIMIT 1`
	err := transaction.QueryRowContext(ctx, selectLANByCodeSQL, hashSecret(code)).Scan(
		&lan.id, &lan.timezone, &rulesJSON, &period.StartsAt, &period.EndsAt)
	if errors.Is(err, sql.ErrNoRows) {
		return lan, period, ErrInvalidCode
	}
	if err != nil {
		return lan, period, fmt.Errorf("find LAN by code: %w", err)
	}
	lan.gameRules, err = parseRules(rulesJSON)
	return lan, period, err
}

// findSeatClaim looks up a seat code. The account is the one named by the code, or else whoever
// sits there, so a new code for a seat brings back its jelly.
func findSeatClaim(
	ctx context.Context, transaction *sql.Tx, lanID int64, code string,
) (seatClaim, bool, error) {
	var claim seatClaim
	var usedAt, playerID sql.NullInt64
	const selectSeatClaimSQL = `SELECT a.id, a.code_used_at, COALESCE(a.code_player_id, e.player_id)
		FROM lan_areas a LEFT JOIN lan_entries e ON e.lan_id = a.lan_id AND e.area_id = a.id
		WHERE a.lan_id = ? AND a.code = ? LIMIT 1`
	err := transaction.QueryRowContext(ctx, selectSeatClaimSQL, lanID, normalizeSeatCode(code)).
		Scan(&claim.areaID, &usedAt, &playerID)
	if errors.Is(err, sql.ErrNoRows) {
		return seatClaim{}, false, nil
	}
	if err != nil {
		return seatClaim{}, false, fmt.Errorf("find seat code: %w", err)
	}
	claim.isUsed = usedAt.Valid
	claim.playerID = playerID.Int64
	return claim, true, nil
}

// createAccount validates the details of a new account and writes it.
func createAccount(ctx context.Context, transaction *sql.Tx, item redemption) (int64, error) {
	name, err := rules.NormalizeName(item.request.Name)
	if err != nil {
		return 0, fmt.Errorf("validate name: %w", err)
	}
	err = rules.ValidateColor(item.request.Color)
	if err != nil {
		return 0, fmt.Errorf("validate color: %w", err)
	}
	return insertPlayer(ctx, transaction, newPlayer{
		token: item.secret, name: name, color: item.request.Color, now: item.now,
	})
}

// restoreAccount gives an existing account a new secret and, if needed, an entry in this LAN.
func restoreAccount(
	ctx context.Context, transaction *sql.Tx, item redemption, playerID int64,
) error {
	const updateSecretSQL = `UPDATE players SET token_hash = ? WHERE id = ?`
	result, err := transaction.ExecContext(ctx, updateSecretSQL, hashSecret(item.secret), playerID)
	if err != nil {
		return fmt.Errorf("replace secret: %w", err)
	}
	err = requireAffectedRow(result, ErrPlayerNotFound)
	if err != nil {
		return err
	}
	err = requireLANEntry(ctx, transaction, item.lan.id, playerID)
	if err == nil {
		return nil
	}
	if !errors.Is(err, ErrNotJoined) {
		return err
	}
	err = insertLANEntry(ctx, transaction, item.lan, playerID, item.now)
	if err != nil {
		return err
	}
	return removeLockedCosmetics(ctx, transaction, playerID, item.now)
}

// placeOnSeat seats the account, sends anyone else away and uses up the code.
func placeOnSeat(
	ctx context.Context, transaction *sql.Tx, item redemption, areaID, playerID int64,
) error {
	const clearSeatSQL = `UPDATE lan_entries SET area_id = NULL
		WHERE lan_id = ? AND area_id = ? AND player_id != ?`
	_, err := transaction.ExecContext(ctx, clearSeatSQL, item.lan.id, areaID, playerID)
	if err != nil {
		return fmt.Errorf("clear seat: %w", err)
	}
	const updateEntrySeatSQL = `UPDATE lan_entries SET area_id = ?
		WHERE lan_id = ? AND player_id = ?`
	_, err = transaction.ExecContext(ctx, updateEntrySeatSQL, areaID, item.lan.id, playerID)
	if err != nil {
		return fmt.Errorf("take seat: %w", err)
	}
	const useCodeSQL = `UPDATE lan_areas SET code_used_at = ? WHERE id = ?`
	_, err = transaction.ExecContext(ctx, useCodeSQL, item.now, areaID)
	if err != nil {
		return fmt.Errorf("use seat code: %w", err)
	}
	return appendStageChanged(ctx, transaction, item.lan.id, item.now)
}

// IssueSeatCode gives a seat a new code and replaces an older one. With a player, the code brings
// that account to this seat, for example at a later LAN.
func (store *Store) IssueSeatCode(
	ctx context.Context, lanID, areaID int64, playerID *int64, now int64,
) (SeatCode, error) {
	code := generateSeatCode()
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		workErr := requireStandingInLAN(ctx, transaction, lanID, areaID)
		if workErr != nil {
			return workErr
		}
		workErr = requireAtMostOneOnSeat(ctx, transaction, lanID, areaID, playerID)
		if workErr != nil {
			return workErr
		}
		const updateSeatCodeSQL = `UPDATE lan_areas
			SET code = ?, code_player_id = ?, code_used_at = NULL WHERE id = ?`
		_, workErr = transaction.ExecContext(ctx, updateSeatCodeSQL, code, playerID, areaID)
		if workErr != nil {
			return fmt.Errorf("issue seat code: %w", workErr)
		}
		return recordAdminAction(ctx, transaction, AdminActionSeatCode, areaID, now)
	})
	if err != nil {
		return SeatCode{}, err
	}
	return SeatCode{AreaID: areaID, Code: code, UsedAt: nil, PlayerID: playerID, Name: nil}, nil
}

// requireAtMostOneOnSeat rejects a code for an area where it is unclear whose jelly it brings back.
func requireAtMostOneOnSeat(
	ctx context.Context, transaction *sql.Tx, lanID, areaID int64, playerID *int64,
) error {
	if playerID != nil {
		return nil
	}
	var occupants int
	const countOccupantsSQL = `SELECT COUNT(*) FROM lan_entries WHERE lan_id = ? AND area_id = ?`
	err := transaction.QueryRowContext(ctx, countOccupantsSQL, lanID, areaID).Scan(&occupants)
	if err != nil {
		return fmt.Errorf("count seat occupants: %w", err)
	}
	if occupants > 1 {
		return ErrAreaOccupied
	}
	return nil
}

// ListSeatCodes returns all codes of a LAN and whose seat they are.
func (store *Store) ListSeatCodes(ctx context.Context, lanID int64) ([]SeatCode, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	const selectSeatCodesSQL = `SELECT a.id, a.code, a.code_used_at,
			COALESCE(a.code_player_id, e.player_id), p.name
		FROM lan_areas a
		LEFT JOIN lan_entries e ON e.lan_id = a.lan_id AND e.area_id = a.id
		LEFT JOIN players p ON p.id = COALESCE(a.code_player_id, e.player_id)
		WHERE a.lan_id = ? AND a.code IS NOT NULL ORDER BY a.id`
	rows, err := store.readDB.QueryContext(queryCtx, selectSeatCodesSQL, lanID)
	if err != nil {
		return nil, fmt.Errorf("load seat codes: %w", err)
	}
	defer func() { _ = rows.Close() }()
	codes := []SeatCode{}
	for rows.Next() {
		var code SeatCode
		err = rows.Scan(&code.AreaID, &code.Code, &code.UsedAt, &code.PlayerID, &code.Name)
		if err != nil {
			return nil, fmt.Errorf("read seat code: %w", err)
		}
		codes = append(codes, code)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load seat codes: %w", err)
	}
	return codes, nil
}

// RequireCurrentEntry reports whether a player takes part in the running LAN.
func (store *Store) RequireCurrentEntry(ctx context.Context, playerID, now int64) error {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	lan, err := loadActiveLAN(queryCtx, store.readDB, now)
	if err != nil {
		return err
	}
	return requireLANEntry(queryCtx, store.readDB, lan.id, playerID)
}

// normalizeSeatCode forgives spaces and lower case when someone types a code from a note.
func normalizeSeatCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}
