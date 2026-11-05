package store

import (
	"context"
	"database/sql"
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
		lastEmoteAt, err := loadLastEventTime(ctx, action.transaction, playerID, EventEmote)
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

// congaFollowers is how many jellies behind the same one make a line.
const congaFollowers = 2

// lighthouseMembers is how many jellies make a stack a lighthouse.
const lighthouseMembers = 2

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

// loadLastEventTime returns when a player last caused this kind of event, or 0 if never.
func loadLastEventTime(
	ctx context.Context, database querier, playerID int64, eventType string,
) (int64, error) {
	var lastAt int64
	const selectLastEventSQL = `SELECT COALESCE(MAX(created_at), 0) FROM event_log
		WHERE player_id = ? AND type = ?`
	err := database.QueryRowContext(ctx, selectLastEventSQL, playerID, eventType).Scan(&lastAt)
	if err != nil {
		return 0, fmt.Errorf("load last event: %w", err)
	}
	return lastAt, nil
}
