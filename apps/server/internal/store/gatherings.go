package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strings"
)

const (
	// GatheringFood sends all jellies into the queue zones.
	GatheringFood = "food"
	// GatheringCeremony sends all jellies to the spectators and the winner to the winner zone.
	GatheringCeremony = "ceremony"
	// A forgotten gathering must not hold the whole hall for days.
	maxGatheringSeconds int64 = 6 * 60 * 60
)

// Gathering sends all jellies of a LAN somewhere until it ends. What they were doing keeps running
// and goes on afterwards if its time is not over yet.
type Gathering struct {
	Kind     string `json:"kind"`
	WinnerID *int64 `json:"winner_id"`
	EndsAt   int64  `json:"ends_at"`
}

// NewGathering is what an admin starts. Only a ceremony has a winner.
type NewGathering struct {
	Kind     string `json:"kind"`
	Seconds  int64  `json:"seconds"`
	WinnerID *int64 `json:"winner_id"`
}

// StartGathering starts a gathering and replaces a running one.
func (store *Store) StartGathering(
	ctx context.Context, lanID int64, gathering NewGathering, now int64,
) (Gathering, error) {
	if !isValidGathering(gathering) {
		return Gathering{}, ErrInvalidInput
	}
	started := Gathering{
		Kind: gathering.Kind, WinnerID: gathering.WinnerID,
		EndsAt: now + gathering.Seconds*millisPerSecond,
	}
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		workErr := writeGathering(ctx, transaction, lanID, started, now)
		if workErr != nil {
			return workErr
		}
		workErr = recordAdminAction(ctx, transaction, AdminActionGathering, lanID, now)
		if workErr != nil {
			return workErr
		}
		return appendGatheringChanged(ctx, transaction, lanID, &started, now)
	})
	if err != nil {
		return Gathering{}, err
	}
	return started, nil
}

// isValidGathering checks the kind, the time and that only a ceremony has a winner.
func isValidGathering(gathering NewGathering) bool {
	isKnownKind := slices.Contains([]string{GatheringFood, GatheringCeremony}, gathering.Kind)
	hasWrongWinner := gathering.Kind == GatheringFood && gathering.WinnerID != nil
	isTimeValid := gathering.Seconds > 0 && gathering.Seconds <= maxGatheringSeconds
	return isKnownKind && !hasWrongWinner && isTimeValid
}

// writeGathering stores a gathering. The winner has to take part in the LAN.
func writeGathering(
	ctx context.Context, transaction *sql.Tx, lanID int64, gathering Gathering, now int64,
) error {
	if gathering.WinnerID != nil {
		err := requireLANEntry(ctx, transaction, lanID, *gathering.WinnerID)
		if err != nil {
			return err
		}
	}
	const replaceGatheringSQL = `INSERT OR REPLACE INTO gatherings
		(lan_id, kind, winner_id, starts_at, ends_at) VALUES (?, ?, ?, ?, ?)`
	_, err := transaction.ExecContext(ctx, replaceGatheringSQL,
		lanID, gathering.Kind, gathering.WinnerID, now, gathering.EndsAt)
	if err != nil && strings.Contains(err.Error(), "FOREIGN KEY") {
		return ErrLANNotFound
	}
	if err != nil {
		return fmt.Errorf("write gathering: %w", err)
	}
	return nil
}

// EndGathering ends a running gathering early.
func (store *Store) EndGathering(ctx context.Context, lanID, now int64) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		const deleteGatheringSQL = `DELETE FROM gatherings WHERE lan_id = ? AND ends_at > ?`
		result, err := transaction.ExecContext(ctx, deleteGatheringSQL, lanID, now)
		if err != nil {
			return fmt.Errorf("end gathering: %w", err)
		}
		err = requireAffectedRow(result, ErrGatheringNotFound)
		if err != nil {
			return err
		}
		err = recordAdminAction(ctx, transaction, AdminActionGathering, lanID, now)
		if err != nil {
			return err
		}
		return appendGatheringChanged(ctx, transaction, lanID, nil, now)
	})
}

// appendGatheringChanged tells every stage what happens now, with null after an early end.
func appendGatheringChanged(
	ctx context.Context, transaction *sql.Tx, lanID int64, gathering *Gathering, now int64,
) error {
	return appendEvent(ctx, transaction, eventRecord{
		lanID: lanID, eventType: EventGatheringChanged, scope: scopePublic, playerID: 0,
		payload: gathering, now: now,
	})
}

// loadRunningGathering returns the gathering of a LAN, or nil if there is none right now.
func loadRunningGathering(
	ctx context.Context, database querier, lanID, now int64,
) (*Gathering, error) {
	var gathering Gathering
	var winnerID sql.NullInt64
	const selectGatheringSQL = `SELECT kind, winner_id, ends_at FROM gatherings
		WHERE lan_id = ? AND ends_at > ?`
	err := database.QueryRowContext(ctx, selectGatheringSQL, lanID, now).
		Scan(&gathering.Kind, &winnerID, &gathering.EndsAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil //nolint:nilnil // No gathering is a normal state, not an error.
	}
	if err != nil {
		return nil, fmt.Errorf("load gathering: %w", err)
	}
	if winnerID.Valid {
		gathering.WinnerID = &winnerID.Int64
	}
	return &gathering, nil
}
