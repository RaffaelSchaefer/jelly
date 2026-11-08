package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// LANChanges names what an admin corrects about a LAN. Missing fields stay as they are, and the
// short name never changes, because it is part of addresses.
type LANChanges struct {
	Name     *string `json:"name"`
	StartsAt *int64  `json:"starts_at"`
	EndsAt   *int64  `json:"ends_at"`
}

// lanPeriod is the part of a LAN that an admin can correct.
type lanPeriod struct {
	name     string
	startsAt int64
	endsAt   int64
}

// UpdateLAN corrects the name or period of a LAN, for example after a typo when it was created.
func (store *Store) UpdateLAN(
	ctx context.Context, lanID int64, changes LANChanges, now int64,
) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		current, err := loadCorrectableLAN(ctx, transaction, lanID)
		if err != nil {
			return err
		}
		updated := applyLANChanges(current, changes)
		if updated.name == "" || !rules.IsLANPeriodValid(updated.startsAt, updated.endsAt) {
			return ErrInvalidInput
		}
		err = requireFreePeriod(ctx, transaction, updated.startsAt, updated.endsAt, lanID)
		if err != nil {
			return err
		}
		const updateLANSQL = `UPDATE lans SET name = ?, starts_at = ?, ends_at = ? WHERE id = ?`
		_, err = transaction.ExecContext(ctx, updateLANSQL,
			updated.name, updated.startsAt, updated.endsAt, lanID)
		if err != nil {
			return fmt.Errorf("update LAN: %w", err)
		}
		return recordAdminAction(ctx, transaction, AdminActionLANUpdate, lanID, now)
	})
}

// DeleteLAN removes a LAN that nobody has joined yet, with its zones and codes.
func (store *Store) DeleteLAN(ctx context.Context, lanID, now int64) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		var players int
		const countLANPlayersSQL = `SELECT COUNT(*) FROM lan_entries WHERE lan_id = ?`
		err := transaction.QueryRowContext(ctx, countLANPlayersSQL, lanID).Scan(&players)
		if err != nil {
			return fmt.Errorf("count players: %w", err)
		}
		if players > 0 {
			return ErrLANHasPlayers
		}
		const deleteLANSQL = `DELETE FROM lans WHERE id = ?`
		result, err := transaction.ExecContext(ctx, deleteLANSQL, lanID)
		if err != nil {
			return fmt.Errorf("delete LAN: %w", err)
		}
		err = requireAffectedRow(result, ErrLANNotFound)
		if err != nil {
			return err
		}
		return recordAdminAction(ctx, transaction, AdminActionLANDelete, lanID, now)
	})
}

// loadCorrectableLAN reads what an admin can correct.
func loadCorrectableLAN(
	ctx context.Context, transaction *sql.Tx, lanID int64,
) (lanPeriod, error) {
	var period lanPeriod
	const selectLANPeriodSQL = `SELECT name, starts_at, ends_at FROM lans WHERE id = ?`
	err := transaction.QueryRowContext(ctx, selectLANPeriodSQL, lanID).
		Scan(&period.name, &period.startsAt, &period.endsAt)
	if errors.Is(err, sql.ErrNoRows) {
		return lanPeriod{}, ErrLANNotFound
	}
	if err != nil {
		return lanPeriod{}, fmt.Errorf("load LAN: %w", err)
	}
	return period, nil
}

// applyLANChanges takes over every field the admin named.
func applyLANChanges(period lanPeriod, changes LANChanges) lanPeriod {
	if changes.Name != nil {
		period.name = strings.TrimSpace(*changes.Name)
	}
	if changes.StartsAt != nil {
		period.startsAt = *changes.StartsAt
	}
	if changes.EndsAt != nil {
		period.endsAt = *changes.EndsAt
	}
	return period
}

// requireFreePeriod refuses a period that overlaps another LAN, so that at most one LAN runs.
// A LAN that is being corrected does not count against itself.
func requireFreePeriod(
	ctx context.Context, transaction *sql.Tx, startsAt, endsAt, ownID int64,
) error {
	var overlapCount int
	const countOverlapsSQL = `SELECT COUNT(*) FROM lans
		WHERE starts_at < ? AND ends_at > ? AND id != ?`
	err := transaction.QueryRowContext(ctx, countOverlapsSQL, endsAt, startsAt, ownID).
		Scan(&overlapCount)
	if err != nil {
		return fmt.Errorf("check period: %w", err)
	}
	if overlapCount > 0 {
		return ErrLANOverlap
	}
	return nil
}
