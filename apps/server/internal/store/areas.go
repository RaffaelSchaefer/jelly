package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// StageArea is one part of the room map. Only public zones show their name.
type StageArea struct {
	ID int64 `json:"id"`
	rules.Area

	Name *string `json:"name"`
}

// AdminArea is a zone as the admin sees it. `MapID` is its ID in the map file, empty if it was not
// imported.
type AdminArea struct {
	ID int64 `json:"id"`
	rules.Area

	Name  string `json:"name"`
	MapID string `json:"map_id"`
}

// AreaAssignment says which area of a LAN a player belongs to.
type AreaAssignment struct {
	PlayerID int64  `json:"player_id"`
	Name     string `json:"name"`
	AreaID   *int64 `json:"area_id"`
}

// CreateArea adds an area to the room map of a LAN.
func (store *Store) CreateArea(
	ctx context.Context, lanID int64, area AdminArea, now int64,
) (AdminArea, error) {
	err := validateAdminArea(area)
	if err != nil {
		return AdminArea{}, fmt.Errorf("validate area: %w", err)
	}
	stored := area
	err = store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		var workErr error
		stored.ID, workErr = insertArea(ctx, transaction, lanID, area)
		if workErr != nil {
			return workErr
		}
		return appendStageChanged(ctx, transaction, lanID, now)
	})
	if err != nil {
		return AdminArea{}, err
	}
	return stored, nil
}

// UpdateArea moves, resizes, renames or changes the assignment of an area. Jellies in it stay
// assigned while they can still stand there.
func (store *Store) UpdateArea(
	ctx context.Context, lanID int64, area AdminArea, now int64,
) (AdminArea, error) {
	invalid := validateAdminArea(area)
	if invalid != nil {
		return AdminArea{}, fmt.Errorf("validate area: %w", invalid)
	}
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		const updateAreaSQL = `UPDATE lan_areas
			SET x = ?, y = ?, width = ?, height = ?, rotation = ?, kind = ?, name = ?, blocks = ?,
				prop = ?
			WHERE id = ? AND lan_id = ?`
		result, err := transaction.ExecContext(
			ctx,
			updateAreaSQL,
			area.X, area.Y, area.Width, area.Height, area.Rotation, area.Kind, area.Name,
			area.Blocks, area.Prop, area.ID, lanID)
		if err != nil {
			return fmt.Errorf("update area: %w", err)
		}
		err = requireAffectedRow(result, ErrAreaNotFound)
		if err != nil {
			return err
		}
		if !rules.IsStandingKind(area.Kind) {
			err = clearAreaAssignments(ctx, transaction, lanID, area.ID)
			if err != nil {
				return err
			}
		}
		// The body does not name the map ID, and an edit keeps the one the zone has.
		const selectAreaMapIDSQL = `SELECT COALESCE(map_id, '') FROM lan_areas WHERE id = ?`
		err = transaction.QueryRowContext(ctx, selectAreaMapIDSQL, area.ID).Scan(&area.MapID)
		if err != nil {
			return fmt.Errorf("read map ID: %w", err)
		}
		return appendStageChanged(ctx, transaction, lanID, now)
	})
	return area, err
}

// validateAdminArea checks what the stage needs and what only the admin page shows.
func validateAdminArea(area AdminArea) error {
	if !rules.IsZoneNameValid(area.Name) {
		return rules.ErrInvalidArea
	}
	err := rules.ValidateArea(area.Area)
	if err != nil {
		return fmt.Errorf("check zone: %w", err)
	}
	return nil
}

// clearAreaAssignments sends the jellies of an area where nobody can stand back to the lounge.
func clearAreaAssignments(ctx context.Context, transaction *sql.Tx, lanID, areaID int64) error {
	const clearAreaSQL = `UPDATE lan_entries SET area_id = NULL WHERE lan_id = ? AND area_id = ?`
	_, err := transaction.ExecContext(ctx, clearAreaSQL, lanID, areaID)
	if err != nil {
		return fmt.Errorf("clear area assignments: %w", err)
	}
	return nil
}

// DeleteArea removes an area. Its jellies lose their assignment and chill in the lounge.
func (store *Store) DeleteArea(ctx context.Context, lanID, areaID, now int64) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		const deleteAreaSQL = `DELETE FROM lan_areas WHERE id = ? AND lan_id = ?`
		result, err := transaction.ExecContext(ctx, deleteAreaSQL, areaID, lanID)
		if err != nil {
			return fmt.Errorf("delete area: %w", err)
		}
		err = requireAffectedRow(result, ErrAreaNotFound)
		if err != nil {
			return err
		}
		return appendStageChanged(ctx, transaction, lanID, now)
	})
}

// ListAreas returns the room map of a LAN with the names of its zones.
func (store *Store) ListAreas(ctx context.Context, lanID int64) ([]AdminArea, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	const selectAdminAreasSQL = `SELECT id, x, y, width, height, rotation, kind, blocks, prop, name,
			COALESCE(map_id, '')
		FROM lan_areas WHERE lan_id = ? ORDER BY id`
	rows, err := store.readDB.QueryContext(queryCtx, selectAdminAreasSQL, lanID)
	if err != nil {
		return nil, fmt.Errorf("list areas: %w", err)
	}
	defer func() { _ = rows.Close() }()
	areas := []AdminArea{}
	for rows.Next() {
		var area AdminArea
		err = rows.Scan(
			&area.ID,
			&area.X,
			&area.Y,
			&area.Width,
			&area.Height,
			&area.Rotation,
			&area.Kind,
			&area.Blocks,
			&area.Prop,
			&area.Name,
			&area.MapID,
		)
		if err != nil {
			return nil, fmt.Errorf("read area: %w", err)
		}
		areas = append(areas, area)
	}
	err = rows.Err()
	if err != nil {
		return nil, fmt.Errorf("list areas: %w", err)
	}
	return areas, nil
}

// ListAreaAssignments returns all players of a LAN with their area.
func (store *Store) ListAreaAssignments(
	ctx context.Context, lanID int64,
) ([]AreaAssignment, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	const selectAssignmentsSQL = `SELECT p.id, p.name, e.area_id
		FROM lan_entries e JOIN players p ON p.id = e.player_id
		WHERE e.lan_id = ? ORDER BY p.name_key`
	rows, err := store.readDB.QueryContext(queryCtx, selectAssignmentsSQL, lanID)
	if err != nil {
		return nil, fmt.Errorf("list assignments: %w", err)
	}
	defer func() { _ = rows.Close() }()
	assignments := []AreaAssignment{}
	for rows.Next() {
		var assignment AreaAssignment
		var areaID sql.NullInt64
		if err := rows.Scan(&assignment.PlayerID, &assignment.Name, &areaID); err != nil {
			return nil, fmt.Errorf("read assignment: %w", err)
		}
		if areaID.Valid {
			assignment.AreaID = &areaID.Int64
		}
		assignments = append(assignments, assignment)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list assignments: %w", err)
	}
	return assignments, nil
}

// AssignArea places a player in an area, or removes them from it with `areaID` nil. Every way of
// choosing an area, such as an admin today or a seat code later, ends here.
func (store *Store) AssignArea(
	ctx context.Context, lanID, playerID int64, areaID *int64, now int64,
) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		if areaID != nil {
			err := requireStandingInLAN(ctx, transaction, lanID, *areaID)
			if err != nil {
				return err
			}
		}
		const updateEntryAreaSQL = `UPDATE lan_entries SET area_id = ?
			WHERE lan_id = ? AND player_id = ?`
		result, err := transaction.ExecContext(ctx, updateEntryAreaSQL,
			areaID, lanID, playerID)
		if err != nil {
			return fmt.Errorf("assign area: %w", err)
		}
		err = requireAffectedRow(result, ErrNotJoined)
		if err != nil {
			return err
		}
		return appendStageChanged(ctx, transaction, lanID, now)
	})
}

// insertArea writes one area, reports an unknown LAN and returns the new ID.
func insertArea(
	ctx context.Context, transaction *sql.Tx, lanID int64, area AdminArea,
) (int64, error) {
	const insertAreaSQL = `INSERT INTO lan_areas
		(lan_id, x, y, width, height, rotation, kind, blocks, prop, name, map_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULLIF(?, ''))`
	result, err := transaction.ExecContext(
		ctx,
		insertAreaSQL,
		lanID,
		area.X,
		area.Y,
		area.Width,
		area.Height,
		area.Rotation,
		area.Kind,
		area.Blocks,
		area.Prop,
		area.Name,
		area.MapID,
	)
	if err != nil && strings.Contains(err.Error(), "FOREIGN KEY") {
		return 0, ErrLANNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("insert area: %w", err)
	}
	areaID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("read area ID: %w", err)
	}
	return areaID, nil
}

// loadAreas reads the room map of a LAN.
func loadAreas(ctx context.Context, database querier, lanID int64) ([]StageArea, error) {
	const selectAreasSQL = `SELECT id, x, y, width, height, rotation, kind, blocks, prop, name
		FROM lan_areas WHERE lan_id = ? ORDER BY id`
	rows, err := database.QueryContext(ctx, selectAreasSQL, lanID)
	if err != nil {
		return nil, fmt.Errorf("load areas: %w", err)
	}
	defer func() { _ = rows.Close() }()
	areas := []StageArea{}
	for rows.Next() {
		var area StageArea
		var name string
		err := rows.Scan(&area.ID, &area.X, &area.Y, &area.Width, &area.Height, &area.Rotation,
			&area.Kind, &area.Blocks, &area.Prop, &name)
		if err != nil {
			return nil, fmt.Errorf("read area: %w", err)
		}
		if area.Kind == rules.AreaKindPublic {
			area.Name = &name
		}
		areas = append(areas, area)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load areas: %w", err)
	}
	return areas, nil
}

// requireStandingInLAN rejects an area that belongs to another LAN or where no jelly can stand.
func requireStandingInLAN(ctx context.Context, database querier, lanID, areaID int64) error {
	var kind string
	const findAreaKindSQL = `SELECT kind FROM lan_areas WHERE id = ? AND lan_id = ?`
	err := database.QueryRowContext(ctx, findAreaKindSQL, areaID, lanID).Scan(&kind)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrAreaNotFound
	}
	if err != nil {
		return fmt.Errorf("check area: %w", err)
	}
	if !rules.IsStandingKind(kind) {
		return ErrAreaNotAssignable
	}
	return nil
}

// appendStageChanged tells every stage to load its state again.
func appendStageChanged(ctx context.Context, transaction *sql.Tx, lanID, now int64) error {
	return appendEvent(ctx, transaction, eventRecord{
		lanID: lanID, eventType: EventStageChanged, scope: scopePublic,
		playerID: 0, payload: struct{}{}, now: now,
	})
}
