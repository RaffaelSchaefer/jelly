package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// lifetimeScopeID stores lifetime achievements, which belong to no single LAN.
const lifetimeScopeID int64 = 0

const payloadKey = "key"

// errUnknownAchievement reports a key missing from the catalog, which is a programming error.
var errUnknownAchievement = errors.New("unknown achievement")

// achievementInput is what an evaluation knows about the running action.
type achievementInput struct {
	lan          activeLAN
	playerID     int64
	now          int64
	restHours    int
	sessionHours int
	isPoke       bool
}

// grantNewAchievements stores and announces everything the player has newly reached.
func grantNewAchievements(
	ctx context.Context, transaction *sql.Tx, input achievementInput,
) error {
	stats, err := loadAchievementStats(ctx, transaction, input)
	if err != nil {
		return err
	}
	earnedKeys, err := loadEarnedKeys(ctx, transaction, input.lan.id, input.playerID)
	if err != nil {
		return err
	}
	hidden, err := isPlayerHidden(ctx, transaction, input.playerID)
	if err != nil {
		return err
	}
	action := actionContext{
		transaction: transaction, lan: input.lan, playerID: input.playerID,
		now: input.now, restHours: input.restHours, sessionHours: input.sessionHours,
		hidden: hidden,
	}
	for _, achievement := range rules.FindNewAchievements(stats, earnedKeys) {
		err = insertAchievement(ctx, action, achievement)
		if err != nil {
			return err
		}
		earnedKeys = append(earnedKeys, achievement.Key)
	}
	for _, achievement := range rules.FindRecordAchievements(earnedKeys) {
		err = raiseAchievementRecord(ctx, action, achievement, stats[achievement.Metric])
		if err != nil {
			return err
		}
	}
	return nil
}

// grantAchievementOnce gives an achievement that its action decides on, not an evaluation.
func grantAchievementOnce(ctx context.Context, action actionContext, key string) error {
	achievement, found := rules.FindAchievement(key)
	if !found {
		return fmt.Errorf("%w: %s", errUnknownAchievement, key)
	}
	earnedKeys, err := loadEarnedKeys(ctx, action.transaction, action.lan.id, action.playerID)
	if err != nil {
		return err
	}
	if slices.Contains(earnedKeys, key) {
		return nil
	}
	return insertAchievement(ctx, action, achievement)
}

// raiseAchievementRecord keeps the best value of an earned achievement, without any announcement.
func raiseAchievementRecord(
	ctx context.Context, action actionContext, achievement rules.Achievement, value int,
) error {
	const raiseBestValueSQL = `UPDATE achievements
		SET best_value = MAX(best_value, ?)
		WHERE player_id = ? AND key = ? AND scope_lan_id = ?`
	_, err := action.transaction.ExecContext(ctx, raiseBestValueSQL,
		value, action.playerID, achievement.Key, findAchievementScopeID(achievement, action.lan.id))
	if err != nil {
		return fmt.Errorf("raise achievement record: %w", err)
	}
	return nil
}

// findAchievementScopeID returns the LAN for per-LAN achievements and 0 for lifetime ones.
func findAchievementScopeID(achievement rules.Achievement, lanID int64) int64 {
	if achievement.Scope == rules.ScopeLAN {
		return lanID
	}
	return lifetimeScopeID
}

// insertAchievement stores one achievement and announces it on the stage.
func insertAchievement(
	ctx context.Context, action actionContext, achievement rules.Achievement,
) error {
	const insertAchievementSQL = `INSERT INTO achievements
		(player_id, key, scope_lan_id, earned_at) VALUES (?, ?, ?, ?)`
	_, err := action.transaction.ExecContext(ctx, insertAchievementSQL,
		action.playerID, achievement.Key, findAchievementScopeID(achievement, action.lan.id),
		action.now)
	if err != nil {
		return fmt.Errorf("insert achievement: %w", err)
	}
	payload := map[string]string{payloadKey: achievement.Key}
	return appendVisibleEvent(ctx, action, EventAchievement, payload)
}

// loadEarnedKeys returns lifetime achievements and those of this LAN.
func loadEarnedKeys(
	ctx context.Context, database querier, lanID, playerID int64,
) ([]string, error) {
	const selectEarnedKeysSQL = `SELECT key FROM achievements
		WHERE player_id = ? AND scope_lan_id IN (?, ?)`
	rows, err := database.QueryContext(ctx, selectEarnedKeysSQL, playerID, lifetimeScopeID, lanID)
	if err != nil {
		return nil, fmt.Errorf("load achievements: %w", err)
	}
	defer func() { _ = rows.Close() }()
	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, fmt.Errorf("read achievement: %w", err)
		}
		keys = append(keys, key)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load achievements: %w", err)
	}
	return keys, nil
}

// isPlayerHidden reads the moderation state of a player.
func isPlayerHidden(ctx context.Context, database querier, playerID int64) (bool, error) {
	var hiddenAt sql.NullInt64
	const selectHiddenAtSQL = `SELECT hidden_at FROM players WHERE id = ?`
	err := database.QueryRowContext(ctx, selectHiddenAtSQL, playerID).Scan(&hiddenAt)
	if err != nil {
		return false, fmt.Errorf("load hidden state: %w", err)
	}
	return hiddenAt.Valid, nil
}
