package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// errPreviewOnly rolls back a map import that only shows what it would change.
var errPreviewOnly = errors.New("map preview only")

// PreviewMap reports what importing a map would change, without changing anything.
func (store *Store) PreviewMap(
	ctx context.Context, lanID int64, roomMap rules.RoomMap,
) (MapImportReport, error) {
	report := newMapImportReport(roomMap)
	run := mapImportRun{lanID: lanID, zones: roomMap.Zones, report: &report}
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		workErr := requireLAN(ctx, transaction, lanID)
		if workErr != nil {
			return workErr
		}
		workErr = writeMapZones(ctx, transaction, run)
		if workErr != nil {
			return workErr
		}
		return errPreviewOnly
	})
	if err != nil && !errors.Is(err, errPreviewOnly) {
		return MapImportReport{}, err
	}
	return report, nil
}

// LoadGathering returns the running gathering of a LAN, or nil if there is none.
func (store *Store) LoadGathering(ctx context.Context, lanID, now int64) (*Gathering, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	return loadRunningGathering(queryCtx, store.readDB, lanID, now)
}

// EndEventCode makes a code invalid from now on, for example after it reached the wrong people. XP
// that players already got stays theirs.
func (store *Store) EndEventCode(ctx context.Context, codeID, now int64) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		const endEventCodeSQL = `UPDATE event_codes SET valid_until = MIN(valid_until, ?)
			WHERE id = ?`
		result, err := transaction.ExecContext(ctx, endEventCodeSQL, now, codeID)
		if err != nil {
			return fmt.Errorf("end event code: %w", err)
		}
		err = requireAffectedRow(result, ErrEventCodeNotFound)
		if err != nil {
			return err
		}
		return recordAdminAction(ctx, transaction, AdminActionEventCodeEnd, codeID, now)
	})
}
