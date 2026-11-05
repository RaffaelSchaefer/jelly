package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// nameConflictMessage is the driver message for a duplicate name.
const nameConflictMessage = "UNIQUE constraint failed: players.name_key"

// ProfileUpdate holds optional profile changes. A nil field stays unchanged.
type ProfileUpdate struct {
	Name  *string
	Color *string
}

// newPlayer is a validated account, ready to be stored.
type newPlayer struct {
	token string
	name  string
	color string
	now   int64
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

// UpdateProfile changes name or color and returns the new state.
func (store *Store) UpdateProfile(
	ctx context.Context, playerID int64, update ProfileUpdate, now int64,
) (PlayerState, error) {
	if update == (ProfileUpdate{}) {
		return store.LoadPlayerState(ctx, playerID, now)
	}
	var state PlayerState
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
		return PlayerState{}, err
	}
	return state, nil
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

// neverSeen is the last activity of a jelly that has only registered so far.
const neverSeen int64 = 0

// insertLANEntry writes the entry, which is also the badge, and announces the jelly.
func insertLANEntry(
	ctx context.Context, transaction *sql.Tx, lan activeLAN, playerID, now int64,
) error {
	err := writeLANEntry(ctx, transaction, lan, newLANEntry{playerID, now, now})
	if err != nil {
		return err
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

// insertFutureEntry registers an account for a LAN that has not started. It counts as attended and
// shows on the stage only once the player does something during the LAN.
func insertFutureEntry(
	ctx context.Context, transaction *sql.Tx, lan activeLAN, playerID, now int64,
) error {
	return writeLANEntry(ctx, transaction, lan, newLANEntry{playerID, now, neverSeen})
}

// newLANEntry is an account joining a LAN.
type newLANEntry struct {
	playerID   int64
	joinedAt   int64
	lastSeenAt int64
}

// writeLANEntry checks the player limit of the LAN and writes the entry.
func writeLANEntry(
	ctx context.Context, transaction *sql.Tx, lan activeLAN, entry newLANEntry,
) error {
	var playerCount int
	const countEntriesSQL = `SELECT COUNT(*) FROM lan_entries WHERE lan_id = ?`
	err := transaction.QueryRowContext(ctx, countEntriesSQL, lan.id).Scan(&playerCount)
	if err != nil {
		return fmt.Errorf("count entries: %w", err)
	}
	if playerCount >= lan.gameRules.MaxPlayers {
		return ErrLANFull
	}
	const insertEntrySQL = `INSERT INTO lan_entries
		(lan_id, player_id, joined_at, last_seen_at, session_started_at) VALUES (?, ?, ?, ?, ?)`
	_, err = transaction.ExecContext(ctx, insertEntrySQL,
		lan.id, entry.playerID, entry.joinedAt, entry.lastSeenAt, entry.joinedAt)
	if err != nil {
		return fmt.Errorf("insert entry: %w", err)
	}
	return nil
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

// recordProfileEdit writes the event and evaluates achievements if a LAN is running.
func recordProfileEdit(ctx context.Context, transaction *sql.Tx, playerID, now int64) error {
	err := appendEvent(ctx, transaction, eventRecord{
		lanID: 0, eventType: EventPlayerUpdated, scope: scopePublic,
		playerID: playerID, payload: map[string]bool{payloadEdited: true}, now: now,
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
