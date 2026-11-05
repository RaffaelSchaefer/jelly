package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// payloadStackID names the stack in `stack.changed` when only its ID is left.
const payloadStackID = "id"

// expiredThings lists what has run out in a LAN and is still stored.
type expiredThings struct {
	trips       []int64
	follows     []int64
	stacks      []int64
	isGathering bool
}

// isEmpty says whether there is nothing to do, which is nearly always the case.
func (expired expiredThings) isEmpty() bool {
	return len(expired.trips) == 0 && len(expired.follows) == 0 && len(expired.stacks) == 0 &&
		!expired.isGathering
}

// FinishExpired clears what ended by itself and announces it, so that a client needs no timers. It
// only writes when something ended, because it runs every second. A restart loses nothing, what
// ran out in the meantime is still stored.
func (store *Store) FinishExpired(ctx context.Context, now int64) error {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	lan, err := loadActiveLAN(queryCtx, store.readDB, now)
	if errors.Is(err, ErrNoActiveLAN) {
		return nil
	}
	if err != nil {
		return err
	}
	expired, err := loadExpired(queryCtx, store.readDB, lan, now)
	if err != nil || expired.isEmpty() {
		return err
	}
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		action := actionContext{
			transaction: transaction, lan: lan, playerID: 0, now: now,
			restHours: 0, sessionHours: 0, hidden: false,
		}
		return finishAll(ctx, action, expired)
	})
}

// loadExpired finds what ran out.
func loadExpired(
	ctx context.Context, database querier, lan activeLAN, now int64,
) (expiredThings, error) {
	var expired expiredThings
	var err error
	const selectExpiredTripsSQL = `SELECT player_id FROM lan_entries
		WHERE lan_id = ? AND trip_until <= ?`
	expired.trips, err = listIDs(ctx, database, selectExpiredTripsSQL, lan.id, now)
	if err != nil {
		return expired, err
	}
	const selectExpiredFollowsSQL = `SELECT player_id FROM lan_entries
		WHERE lan_id = ? AND follow_player_id IS NOT NULL AND follow_started_at <= ?`
	expired.follows, err = listIDs(ctx, database, selectExpiredFollowsSQL, lan.id,
		rules.CalculateFollowCutoff(lan.gameRules, now))
	if err != nil {
		return expired, err
	}
	const selectExpiredStacksSQL = `SELECT id FROM stacks WHERE lan_id = ? AND ends_at <= ?`
	expired.stacks, err = listIDs(ctx, database, selectExpiredStacksSQL, lan.id, now)
	if err != nil {
		return expired, err
	}
	const selectExpiredGatheringSQL = `SELECT lan_id FROM gatherings
		WHERE lan_id = ? AND ends_at <= ?`
	gatherings, err := listIDs(ctx, database, selectExpiredGatheringSQL, lan.id, now)
	expired.isGathering = len(gatherings) > 0
	return expired, err
}

// listIDs reads a query that selects one ID per row.
func listIDs(
	ctx context.Context, database querier, selectIDsSQL string, lanID, limit int64,
) ([]int64, error) {
	rows, err := database.QueryContext(ctx, selectIDsSQL, lanID, limit)
	if err != nil {
		return nil, fmt.Errorf("list expired: %w", err)
	}
	defer func() { _ = rows.Close() }()
	ids := []int64{}
	for rows.Next() {
		var entryID int64
		err = rows.Scan(&entryID)
		if err != nil {
			return nil, fmt.Errorf("read expired: %w", err)
		}
		ids = append(ids, entryID)
	}
	err = rows.Err()
	if err != nil {
		return nil, fmt.Errorf("list expired: %w", err)
	}
	return ids, nil
}

// finishAll ends everything that ran out, in one transaction.
func finishAll(ctx context.Context, action actionContext, expired expiredThings) error {
	for _, playerID := range expired.trips {
		err := finishForPlayer(ctx, action, playerID, endTrip)
		if err != nil {
			return err
		}
	}
	for _, playerID := range expired.follows {
		err := finishForPlayer(ctx, action, playerID, endFollow)
		if err != nil {
			return err
		}
	}
	for _, stackID := range expired.stacks {
		err := finishStack(ctx, action, stackID)
		if err != nil {
			return err
		}
	}
	if !expired.isGathering {
		return nil
	}
	return finishGathering(ctx, action)
}

// finishForPlayer runs an ending as the jelly it belongs to, so a hidden jelly stays quiet.
func finishForPlayer(
	ctx context.Context,
	action actionContext,
	playerID int64,
	end func(context.Context, actionContext) error,
) error {
	own, err := loadOtherPlayerAction(ctx, action, playerID)
	if err != nil {
		return err
	}
	return end(ctx, own)
}

// finishStack deletes a stack whose time is over. Its members go with it.
func finishStack(ctx context.Context, action actionContext, stackID int64) error {
	const deleteStackSQL = `DELETE FROM stacks WHERE id = ?`
	_, err := action.transaction.ExecContext(ctx, deleteStackSQL, stackID)
	if err != nil {
		return fmt.Errorf("delete expired stack: %w", err)
	}
	return appendEvent(ctx, action.transaction, eventRecord{
		lanID: action.lan.id, eventType: EventStackChanged, scope: scopePublic,
		playerID: 0, payload: map[string]int64{payloadStackID: stackID}, now: action.now,
	})
}

// finishGathering deletes a gathering whose time is over.
func finishGathering(ctx context.Context, action actionContext) error {
	const deleteGatheringSQL = `DELETE FROM gatherings WHERE lan_id = ? AND ends_at <= ?`
	_, err := action.transaction.ExecContext(ctx, deleteGatheringSQL, action.lan.id, action.now)
	if err != nil {
		return fmt.Errorf("delete expired gathering: %w", err)
	}
	return appendGatheringChanged(ctx, action.transaction, action.lan.id, nil, action.now)
}

// endTrip clears the trip of a jelly and announces it, if there was one.
func endTrip(ctx context.Context, action actionContext) error {
	const clearTripSQL = `UPDATE lan_entries SET trip_x = NULL, trip_y = NULL, trip_until = NULL
		WHERE lan_id = ? AND player_id = ? AND trip_until IS NOT NULL`
	result, err := action.transaction.ExecContext(ctx, clearTripSQL, action.lan.id, action.playerID)
	if err != nil {
		return fmt.Errorf("clear trip: %w", err)
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("clear trip: %w", err)
	}
	if changed == 0 {
		return nil
	}
	var noTrip *Trip
	return appendVisibleEvent(ctx, action, EventTripChanged, noTrip)
}

// endFollow clears whom a jelly follows and announces it, if there was someone.
func endFollow(ctx context.Context, action actionContext) error {
	const clearFollowSQL = `UPDATE lan_entries SET follow_player_id = NULL
		WHERE lan_id = ? AND player_id = ? AND follow_player_id IS NOT NULL`
	result, err := action.transaction.ExecContext(
		ctx,
		clearFollowSQL,
		action.lan.id,
		action.playerID,
	)
	if err != nil {
		return fmt.Errorf("clear follow: %w", err)
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("clear follow: %w", err)
	}
	if changed == 0 {
		return nil
	}
	return appendVisibleEvent(ctx, action, EventFollowChanged, map[string]any{payloadTargetID: nil})
}

// endWalks ends a trip and following, for when a jelly goes back or stands somewhere else.
func endWalks(ctx context.Context, action actionContext) error {
	err := endTrip(ctx, action)
	if err != nil {
		return err
	}
	return endFollow(ctx, action)
}
