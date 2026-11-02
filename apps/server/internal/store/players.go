package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// nameConflictMessage is the driver message for a duplicate name.
const nameConflictMessage = "UNIQUE constraint failed: players.name_key"

// RegisterRequest holds the details of a new account.
type RegisterRequest struct {
	Code  string
	Name  string
	Color string
}

// ProfileUpdate holds optional profile changes. A nil field stays unchanged, and an empty
// Cosmetic takes the current one off.
type ProfileUpdate struct {
	Name     *string
	Color    *string
	Cosmetic *string
}

// newPlayer is a validated account, ready to be stored.
type newPlayer struct {
	code  string
	token string
	name  string
	color string
	now   int64
}

// RegisterPlayer creates an account with an entry in the current LAN and returns its token.
func (store *Store) RegisterPlayer(
	ctx context.Context, request RegisterRequest, now int64,
) (string, State, error) {
	name, err := rules.NormalizeName(request.Name)
	if err != nil {
		return "", State{}, fmt.Errorf("validate name: %w", err)
	}
	err = rules.ValidateColor(request.Color)
	if err != nil {
		return "", State{}, fmt.Errorf("validate color: %w", err)
	}
	player := newPlayer{
		code:  request.Code,
		token: generateToken(),
		name:  name,
		color: request.Color,
		now:   now,
	}
	var state State
	err = store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		var workErr error
		state, workErr = registerInTransaction(ctx, transaction, player)
		return workErr
	})
	if err != nil {
		return "", State{}, err
	}
	return player.token, state, nil
}

// JoinCurrentLAN adds an existing account to the running LAN.
func (store *Store) JoinCurrentLAN(
	ctx context.Context, playerID int64, code string, now int64,
) (State, error) {
	var state State
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		lan, workErr := loadActiveLAN(ctx, transaction, now)
		if workErr != nil {
			return workErr
		}
		if !matchSecret(lan.joinCodeHash, code) {
			return ErrInvalidCode
		}
		workErr = requireLANEntry(ctx, transaction, lan.id, playerID)
		if workErr == nil {
			return ErrAlreadyJoined
		}
		if !errors.Is(workErr, ErrNotJoined) {
			return workErr
		}
		workErr = insertLANEntry(ctx, transaction, lan, playerID, now)
		if workErr != nil {
			return workErr
		}
		workErr = removeLockedCosmetic(ctx, transaction, playerID, now)
		if workErr != nil {
			return workErr
		}
		state, workErr = loadState(ctx, transaction, playerID, now)
		return workErr
	})
	if err != nil {
		return State{}, err
	}
	return state, nil
}

// FindPlayerByToken returns the account ID for a token.
func (store *Store) FindPlayerByToken(ctx context.Context, token string) (int64, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	var playerID int64
	const selectPlayerIDSQL = `SELECT id FROM players WHERE token_hash = ?`
	err := store.readDB.QueryRowContext(queryCtx, selectPlayerIDSQL,
		hashSecret(token)).Scan(&playerID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrUnauthorized
	}
	if err != nil {
		return 0, fmt.Errorf("find token: %w", err)
	}
	return playerID, nil
}

// UpdateProfile changes name, color or cosmetic and returns the new state.
func (store *Store) UpdateProfile(
	ctx context.Context, playerID int64, update ProfileUpdate, now int64,
) (State, error) {
	var state State
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		workErr := applyProfileUpdate(ctx, transaction, playerID, update)
		if workErr != nil {
			return workErr
		}
		workErr = recordProfileEdit(ctx, transaction, playerID, now)
		if workErr != nil {
			return workErr
		}
		state, workErr = loadState(ctx, transaction, playerID, now)
		return workErr
	})
	if err != nil {
		return State{}, err
	}
	return state, nil
}

// registerInTransaction checks the join code and writes the account and its entry.
func registerInTransaction(
	ctx context.Context, transaction *sql.Tx, player newPlayer,
) (State, error) {
	lan, err := loadActiveLAN(ctx, transaction, player.now)
	if err != nil {
		return State{}, err
	}
	if !matchSecret(lan.joinCodeHash, player.code) {
		return State{}, ErrInvalidCode
	}
	playerID, err := insertPlayer(ctx, transaction, player)
	if err != nil {
		return State{}, err
	}
	err = insertLANEntry(ctx, transaction, lan, playerID, player.now)
	if err != nil {
		return State{}, err
	}
	return loadState(ctx, transaction, playerID, player.now)
}

// insertPlayer writes the `players` row and translates a duplicate name.
func insertPlayer(ctx context.Context, transaction *sql.Tx, player newPlayer) (int64, error) {
	const insertPlayerSQL = `INSERT INTO players
		(token_hash, name, name_key, color, created_at) VALUES (?, ?, ?, ?, ?)`
	result, err := transaction.ExecContext(ctx, insertPlayerSQL,
		hashSecret(player.token), player.name, rules.BuildNameKey(player.name),
		player.color, player.now)
	if isNameConflict(err) {
		return 0, ErrNameTaken
	}
	if err != nil {
		return 0, fmt.Errorf("insert player: %w", err)
	}
	playerID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("read player ID: %w", err)
	}
	return playerID, nil
}

// insertLANEntry writes the entry, which is also the badge, and announces the jelly.
func insertLANEntry(
	ctx context.Context, transaction *sql.Tx, lan activeLAN, playerID, now int64,
) error {
	const insertEntrySQL = `INSERT INTO lan_entries
		(lan_id, player_id, joined_at, last_seen_at, session_started_at) VALUES (?, ?, ?, ?, ?)`
	_, err := transaction.ExecContext(ctx, insertEntrySQL,
		lan.id, playerID, now, now, now)
	if err != nil {
		return fmt.Errorf("insert entry: %w", err)
	}
	err = appendEvent(ctx, transaction, eventRecord{
		lanID: lan.id, eventType: EventPlayerActive, scope: scopePublic,
		playerID: playerID, payload: struct{}{}, now: now,
	})
	if err != nil {
		return err
	}
	return grantNewAchievements(ctx, transaction, achievementInput{
		lan: lan, playerID: playerID, now: now, restHours: 0, sessionHours: 0, isPoke: false,
	})
}

// applyProfileUpdate validates and writes the requested changes.
func applyProfileUpdate(
	ctx context.Context, transaction *sql.Tx, playerID int64, update ProfileUpdate,
) error {
	if update.Name != nil {
		err := updatePlayerName(ctx, transaction, playerID, *update.Name)
		if err != nil {
			return err
		}
	}
	if update.Color != nil {
		err := rules.ValidateColor(*update.Color)
		if err != nil {
			return fmt.Errorf("validate color: %w", err)
		}
		const updateColorSQL = `UPDATE players SET color = ? WHERE id = ?`
		_, err = transaction.ExecContext(ctx, updateColorSQL, *update.Color, playerID)
		if err != nil {
			return fmt.Errorf("update color: %w", err)
		}
	}
	if update.Cosmetic != nil {
		return updatePlayerCosmetic(ctx, transaction, playerID, *update.Cosmetic)
	}
	return nil
}

// updatePlayerName validates a name and translates a duplicate.
func updatePlayerName(
	ctx context.Context, transaction *sql.Tx, playerID int64, requestedName string,
) error {
	name, err := rules.NormalizeName(requestedName)
	if err != nil {
		return fmt.Errorf("validate name: %w", err)
	}
	_, err = transaction.ExecContext(ctx, updatePlayerNameSQL,
		name, rules.BuildNameKey(name), playerID)
	if isNameConflict(err) {
		return ErrNameTaken
	}
	if err != nil {
		return fmt.Errorf("update name: %w", err)
	}
	return nil
}

// updatePlayerCosmetic wears an unlocked cosmetic or, with an empty key, takes it off.
func updatePlayerCosmetic(
	ctx context.Context, transaction *sql.Tx, playerID int64, cosmeticKey string,
) error {
	var stored any
	if cosmeticKey != "" {
		unlocked, err := loadUnlockedCosmetics(ctx, transaction, playerID)
		if err != nil {
			return err
		}
		if !slices.Contains(unlocked, cosmeticKey) {
			return ErrCosmeticLocked
		}
		stored = cosmeticKey
	}
	const updateCosmeticSQL = `UPDATE players SET cosmetic_key = ? WHERE id = ?`
	_, err := transaction.ExecContext(ctx, updateCosmeticSQL, stored, playerID)
	if err != nil {
		return fmt.Errorf("update cosmetic: %w", err)
	}
	return nil
}

// removeLockedCosmetic takes off a cosmetic that no longer counts, such as last LAN's crown.
func removeLockedCosmetic(
	ctx context.Context, transaction *sql.Tx, playerID, now int64,
) error {
	var worn sql.NullString
	const selectCosmeticSQL = `SELECT cosmetic_key FROM players WHERE id = ?`
	err := transaction.QueryRowContext(ctx, selectCosmeticSQL, playerID).Scan(&worn)
	if err != nil {
		return fmt.Errorf("load cosmetic: %w", err)
	}
	if !worn.Valid {
		return nil
	}
	unlocked, err := loadUnlockedCosmetics(ctx, transaction, playerID)
	if err != nil {
		return err
	}
	if slices.Contains(unlocked, worn.String) {
		return nil
	}
	err = updatePlayerCosmetic(ctx, transaction, playerID, "")
	if err != nil {
		return err
	}
	return appendEvent(ctx, transaction, eventRecord{
		lanID: 0, eventType: EventPlayerUpdated, scope: scopePublic,
		playerID: playerID, payload: struct{}{}, now: now,
	})
}

// recordProfileEdit writes the event and evaluates achievements if a LAN is running.
func recordProfileEdit(ctx context.Context, transaction *sql.Tx, playerID, now int64) error {
	err := appendEvent(ctx, transaction, eventRecord{
		lanID: 0, eventType: EventPlayerUpdated, scope: scopePublic,
		playerID: playerID, payload: struct{}{}, now: now,
	})
	if err != nil {
		return err
	}
	lan, err := loadActiveLAN(ctx, transaction, now)
	if errors.Is(err, ErrNoActiveLAN) {
		return nil
	}
	if err != nil {
		return err
	}
	err = requireLANEntry(ctx, transaction, lan.id, playerID)
	if errors.Is(err, ErrNotJoined) {
		return nil
	}
	if err != nil {
		return err
	}
	return grantNewAchievements(ctx, transaction, achievementInput{
		lan: lan, playerID: playerID, now: now, restHours: 0, sessionHours: 0, isPoke: false,
	})
}

// isNameConflict recognizes the driver error for a duplicate name.
func isNameConflict(err error) bool {
	return err != nil && strings.Contains(err.Error(), nameConflictMessage)
}
