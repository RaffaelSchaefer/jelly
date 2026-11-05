package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// payloadTargetID names the jelly in `follow.changed` and `highlight`.
const payloadTargetID = "target_id"

// Trip is a running walk to a point on the stage. At `until` the jelly walks back to its place.
type Trip struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Until int64   `json:"until"`
}

// runningFollow says whom a jelly follows and until when. Both are nil without a running follow.
type runningFollow struct {
	playerID *int64
	until    *int64
}

// findRunningFollow leaves out a follow whose time is over.
func findRunningFollow(
	gameRules rules.Rules, follow sql.NullInt64, startedAt, now int64,
) runningFollow {
	until := rules.CalculateFollowEnd(gameRules, startedAt)
	if !follow.Valid || until <= now {
		return runningFollow{playerID: nil, until: nil}
	}
	return runningFollow{playerID: &follow.Int64, until: &until}
}

// tripColumns holds the stored trip of a jelly, which may be missing or already over.
type tripColumns struct {
	x     sql.NullFloat64
	y     sql.NullFloat64
	until sql.NullInt64
}

// findRunningTrip returns the trip, or nil when there is none or its time is over.
func (columns tripColumns) findRunningTrip(now int64) *Trip {
	if !columns.until.Valid || columns.until.Int64 <= now {
		return nil
	}
	return &Trip{X: columns.x.Float64, Y: columns.y.Float64, Until: columns.until.Int64}
}

// requireFreeFloor rejects a point inside a zone that blocks. Anything else is a valid goal, also a
// seat of someone else.
func requireFreeFloor(ctx context.Context, action actionContext, point rules.StagePoint) error {
	areas, err := loadAreas(ctx, action.transaction, action.lan.id)
	if err != nil {
		return err
	}
	plain := make([]rules.Area, 0, len(areas))
	for _, area := range areas {
		plain = append(plain, area.Area)
	}
	if !rules.IsOnFreeFloor(point, plain) {
		return ErrInvalidTrip
	}
	return nil
}

// StartTrip sends a jelly to a point on the stage. It replaces following or an earlier trip.
func (store *Store) StartTrip(
	ctx context.Context, playerID int64, point rules.StagePoint, now int64,
) (PlayerState, error) {
	if !rules.IsOnStage(point) {
		return PlayerState{}, ErrInvalidTrip
	}
	return store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		err := requireFreeFloor(ctx, action, point)
		if err != nil {
			return err
		}
		err = removeStackMember(ctx, action)
		if err != nil {
			return err
		}
		trip := Trip{
			X: point.X, Y: point.Y,
			Until: rules.CalculateTripEnd(action.lan.gameRules, now),
		}
		const updateTripSQL = `UPDATE lan_entries
			SET trip_x = ?, trip_y = ?, trip_until = ?, follow_player_id = NULL
			WHERE lan_id = ? AND player_id = ?`
		_, err = action.transaction.ExecContext(ctx, updateTripSQL,
			trip.X, trip.Y, trip.Until, action.lan.id, playerID)
		if err != nil {
			return fmt.Errorf("update trip: %w", err)
		}
		return appendVisibleEvent(ctx, action, EventTripChanged, trip)
	})
}

// EndTrip ends a trip or following, so the jelly walks back to its place.
func (store *Store) EndTrip(ctx context.Context, playerID, now int64) (PlayerState, error) {
	return store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		follow, err := loadFollow(ctx, action)
		if err != nil {
			return err
		}
		const clearTripSQL = `UPDATE lan_entries
			SET trip_x = NULL, trip_y = NULL, trip_until = NULL, follow_player_id = NULL
			WHERE lan_id = ? AND player_id = ?`
		_, err = action.transaction.ExecContext(ctx, clearTripSQL, action.lan.id, playerID)
		if err != nil {
			return fmt.Errorf("clear trip: %w", err)
		}
		if !follow.Valid {
			return nil
		}
		return appendVisibleEvent(
			ctx,
			action,
			EventFollowChanged,
			map[string]any{payloadTargetID: nil},
		)
	})
}

// StartFollow lets a jelly follow another one until its time is over. Following the same jelly
// again changes nothing and does not extend the time.
func (store *Store) StartFollow(
	ctx context.Context, playerID, targetID, now int64,
) (PlayerState, error) {
	return store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		follow, err := loadFollow(ctx, action)
		if err != nil {
			return err
		}
		if follow.Int64 == targetID {
			return nil
		}
		err = requireFollowTarget(ctx, action, targetID)
		if err != nil {
			return err
		}
		err = writeFollow(ctx, action, targetID)
		if err != nil {
			return err
		}
		err = grantFoundCompany(ctx, action, targetID)
		if err != nil {
			return err
		}
		return grantConga(ctx, action, targetID)
	})
}

// writeFollow stores the new target. The jelly leaves its stack and ends a running trip.
func writeFollow(ctx context.Context, action actionContext, targetID int64) error {
	err := removeStackMember(ctx, action)
	if err != nil {
		return err
	}
	const updateFollowSQL = `UPDATE lan_entries SET follow_player_id = ?, follow_started_at = ?,
			trip_x = NULL, trip_y = NULL, trip_until = NULL
		WHERE lan_id = ? AND player_id = ?`
	_, err = action.transaction.ExecContext(ctx, updateFollowSQL,
		targetID, action.now, action.lan.id, action.playerID)
	if err != nil {
		return fmt.Errorf("update follow: %w", err)
	}
	payload := map[string]any{payloadTargetID: targetID}
	return appendVisibleEvent(ctx, action, EventFollowChanged, payload)
}

// loadFollow returns whom a jelly follows right now.
func loadFollow(ctx context.Context, action actionContext) (sql.NullInt64, error) {
	var follow sql.NullInt64
	const selectFollowSQL = `SELECT follow_player_id FROM lan_entries
		WHERE lan_id = ? AND player_id = ? AND follow_started_at > ?`
	err := action.transaction.QueryRowContext(ctx, selectFollowSQL, action.lan.id, action.playerID,
		rules.CalculateFollowCutoff(action.lan.gameRules, action.now)).Scan(&follow)
	if errors.Is(err, sql.ErrNoRows) {
		return sql.NullInt64{Int64: 0, Valid: false}, nil
	}
	if err != nil {
		return follow, fmt.Errorf("load follow: %w", err)
	}
	return follow, nil
}

// requireFollowTarget allows only other visible jellies of the running LAN, and no circle of
// jellies following each other.
func requireFollowTarget(ctx context.Context, action actionContext, targetID int64) error {
	if targetID == action.playerID {
		return ErrInvalidFollow
	}
	err := requireVisibleJelly(ctx, action, targetID, ErrInvalidFollow)
	if err != nil {
		return err
	}
	return requireNoFollowCircle(ctx, action, targetID)
}

// requireVisibleJelly returns `missing` unless the jelly is a visible part of the running LAN.
func requireVisibleJelly(
	ctx context.Context, action actionContext, targetID int64, missing error,
) error {
	var found int
	const findVisibleJellySQL = `SELECT 1
		FROM lan_entries e JOIN players p ON p.id = e.player_id
		WHERE e.lan_id = ? AND e.player_id = ? AND p.hidden_at IS NULL`
	err := action.transaction.QueryRowContext(ctx, findVisibleJellySQL,
		action.lan.id, targetID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return missing
	}
	if err != nil {
		return fmt.Errorf("check jelly: %w", err)
	}
	return nil
}

// requireNoFollowCircle walks along the line in front of the target and looks for this jelly.
func requireNoFollowCircle(ctx context.Context, action actionContext, targetID int64) error {
	const findCircleSQL = `WITH RECURSIVE line(player_id) AS (
			SELECT ?1
			UNION
			SELECT e.follow_player_id FROM lan_entries e JOIN line ON e.player_id = line.player_id
			WHERE e.lan_id = ?2 AND e.follow_player_id IS NOT NULL AND e.follow_started_at > ?4
		)
		SELECT COUNT(*) FROM line WHERE player_id = ?3`
	var found int
	err := action.transaction.QueryRowContext(ctx, findCircleSQL,
		targetID, action.lan.id, action.playerID,
		rules.CalculateFollowCutoff(action.lan.gameRules, action.now)).Scan(&found)
	if err != nil {
		return fmt.Errorf("check follow circle: %w", err)
	}
	if found > 0 {
		return ErrInvalidFollow
	}
	return nil
}

// grantConga rewards a line of jellies: several follow the same one, or the followed one follows
// someone too. Everyone directly in that line gets it, the one in front included.
func grantConga(ctx context.Context, action actionContext, targetID int64) error {
	cutoff := rules.CalculateFollowCutoff(action.lan.gameRules, action.now)
	var targetFollows int
	const countTargetFollowSQL = `SELECT COUNT(*) FROM lan_entries
		WHERE lan_id = ? AND player_id = ? AND follow_player_id IS NOT NULL
		AND follow_started_at > ?`
	err := action.transaction.QueryRowContext(ctx, countTargetFollowSQL,
		action.lan.id, targetID, cutoff).Scan(&targetFollows)
	if err != nil {
		return fmt.Errorf("load target follow: %w", err)
	}
	followers, err := listFollowers(ctx, action, targetID)
	if err != nil {
		return err
	}
	if targetFollows == 0 && len(followers) < congaFollowers {
		return nil
	}
	for _, playerID := range append(followers, targetID) {
		member, err := loadOtherPlayerAction(ctx, action, playerID)
		if err != nil {
			return err
		}
		err = grantAchievementOnce(ctx, member, rules.AchievementConga)
		if err != nil {
			return err
		}
	}
	return nil
}

// listFollowers returns who follows a jelly right now.
func listFollowers(ctx context.Context, action actionContext, targetID int64) ([]int64, error) {
	const selectFollowersSQL = `SELECT player_id FROM lan_entries
		WHERE lan_id = ? AND follow_player_id = ? AND follow_started_at > ?`
	rows, err := action.transaction.QueryContext(ctx, selectFollowersSQL, action.lan.id, targetID,
		rules.CalculateFollowCutoff(action.lan.gameRules, action.now))
	if err != nil {
		return nil, fmt.Errorf("list followers: %w", err)
	}
	defer func() { _ = rows.Close() }()
	followers := []int64{}
	for rows.Next() {
		var playerID int64
		if err := rows.Scan(&playerID); err != nil {
			return nil, fmt.Errorf("read follower: %w", err)
		}
		followers = append(followers, playerID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list followers: %w", err)
	}
	return followers, nil
}
