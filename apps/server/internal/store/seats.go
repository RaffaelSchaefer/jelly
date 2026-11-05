package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// noPlayer marks a request or a seat code without an account.
const noPlayer int64 = 0

// SeatCode is the registration code of a seat, as the admin map shows it. `IsSeated` tells whether
// the account of the code sits there. If not, the seat was taken and the orga assigns one by hand.
type SeatCode struct {
	AreaID   int64   `json:"area_id"`
	Code     string  `json:"code"`
	UsedAt   *int64  `json:"used_at"`
	PlayerID *int64  `json:"player_id"`
	Name     *string `json:"name"`
	IsSeated bool    `json:"is_seated"`
}

// RedeemRequest holds a code. `PlayerID` is the verified account of the caller or 0 without one.
// Name and color only count if the code creates a new account.
type RedeemRequest struct {
	Code     string
	Name     string
	Color    string
	PlayerID int64
}

// RedeemedAccess is the result of a code. `Secret` is only set for a new account, because an
// existing one keeps its secret.
type RedeemedAccess struct {
	Secret       string
	SeatAssigned bool
	Me           PlayerState
}

// redemption is one exchange of a code.
type redemption struct {
	request RedeemRequest
	secret  string
	now     int64
}

// codeLAN is the LAN a code leads to.
type codeLAN struct {
	lan    activeLAN
	period LANPeriod
}

// seatClaim is what a seat code leads to.
type seatClaim struct {
	areaID   int64
	lanID    int64
	playerID int64
	isUsed   bool
}

// RedeemCode brings an account into a LAN. A seat code also places it on that seat, and the shared
// code of a LAN does not. With a verified caller, that account joins. Otherwise a new one appears.
func (store *Store) RedeemCode(
	ctx context.Context, request RedeemRequest, now int64,
) (RedeemedAccess, error) {
	access := RedeemedAccess{Secret: "", SeatAssigned: false, Me: PlayerState{}}
	if request.PlayerID == noPlayer {
		access.Secret = generateToken()
	}
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		item := redemption{request: request, secret: access.Secret, now: now}
		playerID, isSeated, workErr := redeemForPlayer(ctx, transaction, item)
		if workErr != nil {
			return workErr
		}
		access.SeatAssigned = isSeated
		access.Me, workErr = loadState(ctx, transaction, playerID, now)
		return workErr
	})
	if err != nil {
		return RedeemedAccess{}, err
	}
	return access, nil
}

// redeemForPlayer tells seat codes from the shared code of a LAN. It returns the account and
// whether it got the seat of the code.
func redeemForPlayer(
	ctx context.Context, transaction *sql.Tx, item redemption,
) (int64, bool, error) {
	claim, found, err := findSeatClaim(ctx, transaction, item.request.Code)
	if err != nil {
		return 0, false, err
	}
	if found {
		return redeemSeatCode(ctx, transaction, item, claim)
	}
	playerID, err := redeemLANCode(ctx, transaction, item)
	return playerID, false, err
}

// redeemSeatCode brings an account into the LAN of the code and tries to seat it. A rejected code
// stays valid, so a stranger cannot use up the code of its owner. A taken seat uses up the code,
// and the orga assigns a seat by hand.
func redeemSeatCode(
	ctx context.Context, transaction *sql.Tx, item redemption, claim seatClaim,
) (int64, bool, error) {
	if claim.isUsed {
		return 0, false, ErrCodeRedeemed
	}
	if claim.playerID != noPlayer && claim.playerID != item.request.PlayerID {
		return 0, false, ErrSeatCodeOtherAccount
	}
	target, err := loadCodeLAN(ctx, transaction, claim.lanID)
	if err != nil {
		return 0, false, err
	}
	if item.now >= target.period.EndsAt {
		return 0, false, ErrInvalidCode
	}
	playerID, err := findOrCreateAccount(ctx, transaction, item)
	if err != nil {
		return 0, false, err
	}
	err = joinLAN(ctx, transaction, target, playerID, item.now)
	if err != nil {
		return 0, false, err
	}
	isSeated, err := takeFreeSeat(ctx, transaction, item, claim, playerID)
	if err != nil {
		return 0, false, err
	}
	const useCodeSQL = `UPDATE lan_areas SET code_used_at = ?, code_player_id = ? WHERE id = ?`
	_, err = transaction.ExecContext(ctx, useCodeSQL, item.now, playerID, claim.areaID)
	if err != nil {
		return 0, false, fmt.Errorf("use seat code: %w", err)
	}
	return playerID, isSeated, nil
}

// redeemLANCode brings an account into a LAN without a seat. After the LAN it is only an account.
func redeemLANCode(ctx context.Context, transaction *sql.Tx, item redemption) (int64, error) {
	target, err := findLANByCode(ctx, transaction, item.request.Code)
	if err != nil {
		return 0, err
	}
	playerID, err := findOrCreateAccount(ctx, transaction, item)
	if err != nil {
		return 0, err
	}
	return playerID, joinLAN(ctx, transaction, target, playerID, item.now)
}

// findOrCreateAccount returns the verified caller or writes a new account.
func findOrCreateAccount(ctx context.Context, transaction *sql.Tx, item redemption) (int64, error) {
	if item.request.PlayerID != noPlayer {
		return item.request.PlayerID, nil
	}
	return createAccount(ctx, transaction, item)
}

// joinLAN adds an account to a LAN if it is not part of it yet. Before the LAN starts, it only
// registers, and after its end nothing changes.
func joinLAN(
	ctx context.Context, transaction *sql.Tx, target codeLAN, playerID, now int64,
) error {
	err := requireLANEntry(ctx, transaction, target.lan.id, playerID)
	if !errors.Is(err, ErrNotJoined) {
		return err
	}
	switch {
	case now < target.period.StartsAt:
		return insertFutureEntry(ctx, transaction, target.lan, playerID, now)
	case now < target.period.EndsAt:
		err = insertLANEntry(ctx, transaction, target.lan, playerID, now)
		if err != nil {
			return err
		}
		return removeLockedCosmetics(ctx, transaction, playerID, now)
	default:
		return nil
	}
}

// findLANByCode returns the newest LAN with this shared code.
func findLANByCode(ctx context.Context, transaction *sql.Tx, code string) (codeLAN, error) {
	const selectLANByCodeSQL = `SELECT id, timezone, rules, starts_at, ends_at FROM lans
		WHERE join_code_hash = ? ORDER BY starts_at DESC LIMIT 1`
	row := transaction.QueryRowContext(ctx, selectLANByCodeSQL, hashSecret(code))
	return scanCodeLAN(row)
}

// loadCodeLAN returns the LAN of a seat code.
func loadCodeLAN(ctx context.Context, transaction *sql.Tx, lanID int64) (codeLAN, error) {
	const selectLANByIDSQL = `SELECT id, timezone, rules, starts_at, ends_at FROM lans WHERE id = ?`
	return scanCodeLAN(transaction.QueryRowContext(ctx, selectLANByIDSQL, lanID))
}

// scanCodeLAN reads the LAN that a code leads to.
func scanCodeLAN(row *sql.Row) (codeLAN, error) {
	var target codeLAN
	var rulesJSON string
	err := row.Scan(&target.lan.id, &target.lan.timezone, &rulesJSON,
		&target.period.StartsAt, &target.period.EndsAt)
	if errors.Is(err, sql.ErrNoRows) {
		return target, ErrInvalidCode
	}
	if err != nil {
		return target, fmt.Errorf("find LAN of code: %w", err)
	}
	target.lan.gameRules, err = parseRules(rulesJSON)
	return target, err
}

// findSeatClaim looks up a seat code in all LANs.
func findSeatClaim(
	ctx context.Context, transaction *sql.Tx, code string,
) (seatClaim, bool, error) {
	var claim seatClaim
	var usedAt, playerID sql.NullInt64
	const selectSeatClaimSQL = `SELECT id, lan_id, code_used_at, code_player_id
		FROM lan_areas WHERE code = ?`
	err := transaction.QueryRowContext(ctx, selectSeatClaimSQL, normalizeSeatCode(code)).
		Scan(&claim.areaID, &claim.lanID, &usedAt, &playerID)
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

// takeFreeSeat seats the account, unless someone else sits there or it already has another seat.
// Seats are never given out by chance, because that would mix up the seating plan.
func takeFreeSeat(
	ctx context.Context, transaction *sql.Tx, item redemption, claim seatClaim, playerID int64,
) (bool, error) {
	var conflicts int
	const countSeatConflictsSQL = `SELECT COUNT(*) FROM lan_entries WHERE lan_id = ? AND (
			(area_id = ? AND player_id != ?)
			OR (player_id = ? AND area_id IS NOT NULL AND area_id != ?)
		)`
	err := transaction.QueryRowContext(ctx, countSeatConflictsSQL,
		claim.lanID, claim.areaID, playerID, playerID, claim.areaID).Scan(&conflicts)
	if err != nil {
		return false, fmt.Errorf("check seat: %w", err)
	}
	if conflicts > 0 {
		return false, nil
	}
	const updateEntrySeatSQL = `UPDATE lan_entries SET area_id = ?
		WHERE lan_id = ? AND player_id = ?`
	_, err = transaction.ExecContext(ctx, updateEntrySeatSQL, claim.areaID, claim.lanID, playerID)
	if err != nil {
		return false, fmt.Errorf("take seat: %w", err)
	}
	return true, appendStageChanged(ctx, transaction, claim.lanID, item.now)
}

// IssueSeatCode gives a seat a new code and replaces an older one. With a player, only that account
// can use the code. Without one, the first account that uses it owns it.
func (store *Store) IssueSeatCode(
	ctx context.Context, lanID, areaID int64, playerID *int64, now int64,
) (SeatCode, error) {
	code := generateSeatCode()
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		workErr := requireStandingInLAN(ctx, transaction, lanID, areaID)
		if workErr != nil {
			return workErr
		}
		if playerID != nil {
			workErr = requireAccount(ctx, transaction, *playerID)
			if workErr != nil {
				return workErr
			}
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
	return SeatCode{
		AreaID: areaID, Code: code, UsedAt: nil, PlayerID: playerID, Name: nil, IsSeated: false,
	}, nil
}

// requireAccount rejects a player that does not exist.
func requireAccount(ctx context.Context, transaction *sql.Tx, playerID int64) error {
	var found int
	const findAccountSQL = `SELECT 1 FROM players WHERE id = ?`
	err := transaction.QueryRowContext(ctx, findAccountSQL, playerID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrPlayerNotFound
	}
	if err != nil {
		return fmt.Errorf("find account: %w", err)
	}
	return nil
}

// ListSeatCodes returns all codes of a LAN and whose seat they are.
func (store *Store) ListSeatCodes(ctx context.Context, lanID int64) ([]SeatCode, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	const selectSeatCodesSQL = `SELECT a.id, a.code, a.code_used_at, a.code_player_id, p.name,
			EXISTS(SELECT 1 FROM lan_entries e WHERE e.lan_id = a.lan_id AND e.area_id = a.id
				AND e.player_id = a.code_player_id)
		FROM lan_areas a
		LEFT JOIN players p ON p.id = a.code_player_id
		WHERE a.lan_id = ? AND a.code IS NOT NULL ORDER BY a.id`
	rows, err := store.readDB.QueryContext(queryCtx, selectSeatCodesSQL, lanID)
	if err != nil {
		return nil, fmt.Errorf("load seat codes: %w", err)
	}
	defer func() { _ = rows.Close() }()
	codes := []SeatCode{}
	for rows.Next() {
		var code SeatCode
		err = rows.Scan(
			&code.AreaID, &code.Code, &code.UsedAt, &code.PlayerID, &code.Name, &code.IsSeated,
		)
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
