package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// ApplyEmote plays an emote from the fixed list on the stage.
func (store *Store) ApplyEmote(
	ctx context.Context, playerID int64, emoteKey string, now int64,
) (PlayerState, error) {
	err := rules.ValidateEmote(emoteKey)
	if err != nil {
		return PlayerState{}, fmt.Errorf("validate emote: %w", err)
	}
	return store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		lastEmoteAt, err := loadLastEmoteTime(ctx, action.transaction, playerID)
		if err != nil {
			return err
		}
		if !rules.IsEmoteAllowed(action.lan.gameRules, lastEmoteAt, now) {
			return ErrEmoteCooldown
		}
		return appendVisibleEvent(ctx, action, EventEmote, map[string]string{payloadKey: emoteKey})
	})
}

// UpdateSign shows a sign from the fixed list or, with an empty key, lowers it.
func (store *Store) UpdateSign(
	ctx context.Context, playerID int64, signKey string, now int64,
) (PlayerState, error) {
	var stored any
	if signKey != "" {
		err := rules.ValidateSign(signKey)
		if err != nil {
			return PlayerState{}, fmt.Errorf("validate sign: %w", err)
		}
		stored = signKey
	}
	return store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		const updateSignSQL = `UPDATE lan_entries SET sign_key = ?
			WHERE lan_id = ? AND player_id = ?`
		_, err := action.transaction.ExecContext(ctx, updateSignSQL,
			stored, action.lan.id, playerID)
		if err != nil {
			return fmt.Errorf("update sign: %w", err)
		}
		return appendVisibleEvent(ctx, action, EventSignChanged, map[string]any{payloadKey: stored})
	})
}

// UpdateFollow stands next to another jelly or, with a target of 0, walks away.
func (store *Store) UpdateFollow(
	ctx context.Context, playerID, targetID, now int64,
) (PlayerState, error) {
	return store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		var current sql.NullInt64
		const selectFollowSQL = `SELECT follow_player_id FROM lan_entries
			WHERE lan_id = ? AND player_id = ?`
		err := action.transaction.QueryRowContext(ctx, selectFollowSQL,
			action.lan.id, playerID).Scan(&current)
		if err != nil {
			return fmt.Errorf("load follow: %w", err)
		}
		if current.Int64 == targetID {
			return nil
		}
		var stored any
		if targetID != 0 {
			err = requireFollowTarget(ctx, action, targetID)
			if err != nil {
				return err
			}
			stored = targetID
		}
		const updateFollowSQL = `UPDATE lan_entries SET follow_player_id = ?
			WHERE lan_id = ? AND player_id = ?`
		_, err = action.transaction.ExecContext(ctx, updateFollowSQL,
			stored, action.lan.id, playerID)
		if err != nil {
			return fmt.Errorf("update follow: %w", err)
		}
		payload := map[string]any{"target_id": stored}
		err = appendVisibleEvent(ctx, action, EventFollowChanged, payload)
		if err != nil || targetID == 0 {
			return err
		}
		return grantFoundCompany(ctx, action, targetID)
	})
}

// grantFoundCompany rewards the visitor and the visited jelly if its search sign is up.
func grantFoundCompany(ctx context.Context, action actionContext, targetID int64) error {
	var sign sql.NullString
	const selectTargetSignSQL = `SELECT sign_key FROM lan_entries
		WHERE lan_id = ? AND player_id = ?`
	err := action.transaction.QueryRowContext(ctx, selectTargetSignSQL,
		action.lan.id, targetID).Scan(&sign)
	if err != nil {
		return fmt.Errorf("load sign: %w", err)
	}
	if !sign.Valid {
		return nil
	}
	err = grantAchievementOnce(ctx, action, rules.AchievementFoundCompany)
	if err != nil {
		return err
	}
	target, err := loadOtherPlayerAction(ctx, action, targetID)
	if err != nil {
		return err
	}
	return grantAchievementOnce(ctx, target, rules.AchievementFoundCompany)
}

// requireFollowTarget allows only other visible jellies of the running LAN.
func requireFollowTarget(ctx context.Context, action actionContext, targetID int64) error {
	if targetID == action.playerID {
		return ErrInvalidFollow
	}
	var found int
	const findFollowTargetSQL = `SELECT 1
		FROM lan_entries e JOIN players p ON p.id = e.player_id
		WHERE e.lan_id = ? AND e.player_id = ? AND p.hidden_at IS NULL`
	err := action.transaction.QueryRowContext(ctx, findFollowTargetSQL,
		action.lan.id, targetID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrInvalidFollow
	}
	if err != nil {
		return fmt.Errorf("check follow target: %w", err)
	}
	return nil
}

// loadLastEmoteTime returns the last emote of a player, or 0 without one.
func loadLastEmoteTime(ctx context.Context, database querier, playerID int64) (int64, error) {
	var lastEmoteAt int64
	const selectLastEmoteSQL = `SELECT COALESCE(MAX(created_at), 0) FROM event_log
		WHERE player_id = ? AND type = ?`
	err := database.QueryRowContext(ctx, selectLastEmoteSQL,
		playerID, EventEmote).Scan(&lastEmoteAt)
	if err != nil {
		return 0, fmt.Errorf("load last emote: %w", err)
	}
	return lastEmoteAt, nil
}
