package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// LoadLANSchedule returns the program of a LAN as the orga stores it, with its repeats.
func (store *Store) LoadLANSchedule(
	ctx context.Context,
	lanID int64,
) ([]rules.ScheduleItem, error) {
	const selectScheduleSQL = `SELECT schedule FROM lans WHERE id = ?`
	items, found, err := store.loadSchedule(ctx, selectScheduleSQL, lanID)
	if err == nil && !found {
		return nil, ErrLANNotFound
	}
	return items, err
}

// LoadCurrentSchedule returns the program of the running LAN, otherwise of the next one, the same
// LAN whose rules `GET /lans/current` names, with every repeat written out. Without a LAN, the
// program is empty.
func (store *Store) LoadCurrentSchedule(
	ctx context.Context, now int64,
) ([]rules.ScheduleItem, error) {
	const selectCurrentScheduleSQL = `SELECT schedule FROM lans WHERE ends_at > ?1
		ORDER BY (starts_at <= ?1) DESC, starts_at LIMIT 1`
	items, _, err := store.loadSchedule(ctx, selectCurrentScheduleSQL, now)
	if err != nil {
		return nil, err
	}
	return rules.ExpandSchedule(items), nil
}

// loadSchedule reads the program of the one LAN a query finds. Without a LAN it is empty.
func (store *Store) loadSchedule(
	ctx context.Context, selectScheduleSQL string, argument int64,
) ([]rules.ScheduleItem, bool, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	var scheduleJSON string
	err := store.readDB.QueryRowContext(queryCtx, selectScheduleSQL, argument).Scan(&scheduleJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return []rules.ScheduleItem{}, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("load schedule: %w", err)
	}
	items, err := parseSchedule(scheduleJSON)
	return items, true, err
}

// ReplaceLANSchedule checks and stores the whole program of a LAN and tells open apps about it.
func (store *Store) ReplaceLANSchedule(
	ctx context.Context, lanID int64, items []rules.ScheduleItem, now int64,
) ([]rules.ScheduleItem, error) {
	var prepared []rules.ScheduleItem
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		var startsAt, endsAt int64
		const selectLANTimesSQL = `SELECT starts_at, ends_at FROM lans WHERE id = ?`
		err := transaction.QueryRowContext(ctx, selectLANTimesSQL, lanID).Scan(&startsAt, &endsAt)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrLANNotFound
		}
		if err != nil {
			return fmt.Errorf("load LAN times: %w", err)
		}
		prepared, err = rules.PrepareSchedule(items, startsAt, endsAt)
		if err != nil {
			return fmt.Errorf("check schedule: %w", err)
		}
		return storeSchedule(ctx, transaction, lanID, prepared, now)
	})
	return prepared, err
}

// storeSchedule writes the program, the admin log and the event in one transaction.
func storeSchedule(
	ctx context.Context, transaction *sql.Tx, lanID int64, items []rules.ScheduleItem, now int64,
) error {
	scheduleJSON, err := json.Marshal(items)
	if err != nil {
		return fmt.Errorf("encode schedule: %w", err)
	}
	const updateScheduleSQL = `UPDATE lans SET schedule = ? WHERE id = ?`
	_, err = transaction.ExecContext(ctx, updateScheduleSQL, string(scheduleJSON), lanID)
	if err != nil {
		return fmt.Errorf("update schedule: %w", err)
	}
	err = recordAdminAction(ctx, transaction, AdminActionSchedule, lanID, now)
	if err != nil {
		return err
	}
	return appendEvent(ctx, transaction, eventRecord{
		lanID: lanID, eventType: EventScheduleChanged, scope: scopePublic,
		playerID: 0, payload: struct{}{}, now: now,
	})
}

// parseSchedule reads a stored program.
func parseSchedule(scheduleJSON string) ([]rules.ScheduleItem, error) {
	items := []rules.ScheduleItem{}
	err := json.Unmarshal([]byte(scheduleJSON), &items)
	if err != nil {
		return nil, fmt.Errorf("parse schedule: %w", err)
	}
	return items, nil
}
