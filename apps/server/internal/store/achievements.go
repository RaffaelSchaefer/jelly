package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// lifetimeScopeID stores lifetime achievements, which belong to no single LAN.
const lifetimeScopeID int64 = 0

const (
	nightOwlHour = 4
	payloadKey   = "key"
)

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

// raiseAchievementRecord keeps the best value of an earned achievement, without any announcement.
func raiseAchievementRecord(
	ctx context.Context, action actionContext, achievement rules.Achievement, value int,
) error {
	_, err := action.transaction.ExecContext(ctx, `UPDATE achievements
		SET best_value = MAX(best_value, ?)
		WHERE player_id = ? AND key = ? AND scope_lan_id = ?`,
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
	_, err := action.transaction.ExecContext(ctx, `INSERT INTO achievements
		(player_id, key, scope_lan_id, earned_at) VALUES (?, ?, ?, ?)`,
		action.playerID, achievement.Key, findAchievementScopeID(achievement, action.lan.id),
		action.now)
	if err != nil {
		return fmt.Errorf("insert achievement: %w", err)
	}
	payload := map[string]string{payloadKey: achievement.Key}
	if achievement.Quiet {
		return appendEvent(ctx, action.transaction, eventRecord{
			lanID: action.lan.id, eventType: EventAchievement, scope: scopePlayer,
			playerID: action.playerID, payload: payload, now: action.now,
		})
	}
	return appendVisibleEvent(ctx, action, EventAchievement, payload)
}

// loadEarnedKeys returns lifetime achievements and those of this LAN.
func loadEarnedKeys(
	ctx context.Context, database querier, lanID, playerID int64,
) ([]string, error) {
	rows, err := database.QueryContext(ctx, `SELECT key FROM achievements
		WHERE player_id = ? AND scope_lan_id IN (?, ?)`, playerID, lifetimeScopeID, lanID)
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

// loadAchievementStats gathers all metrics the catalog can ask for.
func loadAchievementStats(
	ctx context.Context, database querier, input achievementInput,
) (map[rules.Metric]int, error) {
	stats := map[rules.Metric]int{
		rules.MetricRestHours:    0,
		rules.MetricOwlNights:    0,
		rules.MetricSessionHours: input.sessionHours,
	}
	if input.isPoke {
		stats[rules.MetricRestHours] = input.restHours
		owlNights, err := countOwlNights(ctx, database, input)
		if err != nil {
			return nil, err
		}
		stats[rules.MetricOwlNights] = owlNights
	}
	const query = `SELECT
		(SELECT COUNT(*) FROM xp_log WHERE player_id = ?1 AND action = 'poke'),
		(SELECT COUNT(*) FROM xp_log WHERE player_id = ?1 AND lan_id = ?2 AND action = 'drink'),
		(SELECT COUNT(*) FROM xp_log WHERE player_id = ?1 AND lan_id = ?2 AND action = 'event'),
		(SELECT COUNT(*) FROM xp_log WHERE player_id = ?1 AND action = 'event'),
		(SELECT COUNT(*) FROM lan_entries WHERE player_id = ?1),
		(SELECT COUNT(*) FROM event_log WHERE player_id = ?1 AND type = ?3),
		(SELECT COUNT(DISTINCT json_extract(payload, '$.target_id')) FROM event_log
			WHERE player_id = ?1 AND lan_id = ?2 AND type = ?4
			AND json_extract(payload, '$.target_id') IS NOT NULL),
		(SELECT COUNT(*) FROM awards WHERE player_id = ?1)`
	var pokes, drinks, eventsLAN, eventsTotal, attended, edits, joined, awards int
	err := database.QueryRowContext(ctx, query, input.playerID, input.lan.id,
		EventPlayerUpdated, EventFollowChanged).
		Scan(&pokes, &drinks, &eventsLAN, &eventsTotal, &attended, &edits, &joined, &awards)
	if err != nil {
		return nil, fmt.Errorf("load achievement stats: %w", err)
	}
	stats[rules.MetricPokes] = pokes
	stats[rules.MetricDrinks] = drinks
	stats[rules.MetricEventsLAN] = eventsLAN
	stats[rules.MetricEventsTotal] = eventsTotal
	stats[rules.MetricLANsAttended] = attended
	stats[rules.MetricProfileEdits] = edits
	stats[rules.MetricJelliesJoined] = joined
	stats[rules.MetricAwards] = awards
	return stats, nil
}

// countOwlNights counts the local dates of this LAN with an XP poke in the 4 am hour.
func countOwlNights(
	ctx context.Context, database querier, input achievementInput,
) (int, error) {
	location, err := time.LoadLocation(input.lan.timezone)
	if err != nil {
		return 0, fmt.Errorf("load time zone: %w", err)
	}
	rows, err := database.QueryContext(ctx, `SELECT created_at FROM xp_log
		WHERE player_id = ? AND lan_id = ? AND action = ?`,
		input.playerID, input.lan.id, actionPoke)
	if err != nil {
		return 0, fmt.Errorf("load poke times: %w", err)
	}
	defer func() { _ = rows.Close() }()
	nights := map[string]bool{}
	for rows.Next() {
		var pokedAt int64
		if err := rows.Scan(&pokedAt); err != nil {
			return 0, fmt.Errorf("read poke time: %w", err)
		}
		local := time.UnixMilli(pokedAt).In(location)
		if local.Hour() == nightOwlHour {
			nights[local.Format(time.DateOnly)] = true
		}
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("load poke times: %w", err)
	}
	return len(nights), nil
}

// isPlayerHidden reads the moderation state of a player.
func isPlayerHidden(ctx context.Context, database querier, playerID int64) (bool, error) {
	var hiddenAt sql.NullInt64
	err := database.QueryRowContext(ctx,
		`SELECT hidden_at FROM players WHERE id = ?`, playerID).Scan(&hiddenAt)
	if err != nil {
		return false, fmt.Errorf("load hidden state: %w", err)
	}
	return hiddenAt.Valid, nil
}
