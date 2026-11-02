package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// StageArea is one part of the room map.
type StageArea struct {
	ID int64 `json:"id"`
	rules.Area
}

// AreaAssignment says which area of a LAN a player belongs to.
type AreaAssignment struct {
	PlayerID int64  `json:"player_id"`
	Name     string `json:"name"`
	AreaID   *int64 `json:"area_id"`
}

// ReplaceAreas sets the room map of a LAN. Replacing it clears all assignments of that LAN.
func (store *Store) ReplaceAreas(
	ctx context.Context, lanID int64, areas []rules.Area, now int64,
) ([]StageArea, error) {
	err := rules.ValidateAreas(areas)
	if err != nil {
		return nil, fmt.Errorf("validate areas: %w", err)
	}
	var stored []StageArea
	err = store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		_, workErr := transaction.ExecContext(ctx, `DELETE FROM lan_areas WHERE lan_id = ?`, lanID)
		if workErr != nil {
			return fmt.Errorf("delete areas: %w", workErr)
		}
		for _, area := range areas {
			workErr = insertArea(ctx, transaction, lanID, area)
			if workErr != nil {
				return workErr
			}
		}
		stored, workErr = loadAreas(ctx, transaction, lanID)
		if workErr != nil {
			return workErr
		}
		return appendStageChanged(ctx, transaction, lanID, now)
	})
	if err != nil {
		return nil, err
	}
	return stored, nil
}

// ListAreas returns the room map of a LAN.
func (store *Store) ListAreas(ctx context.Context, lanID int64) ([]StageArea, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	return loadAreas(queryCtx, store.readDB, lanID)
}

// ListAreaAssignments returns all players of a LAN with their area.
func (store *Store) ListAreaAssignments(
	ctx context.Context, lanID int64,
) ([]AreaAssignment, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	rows, err := store.readDB.QueryContext(queryCtx, `SELECT p.id, p.name, e.area_id
		FROM lan_entries e JOIN players p ON p.id = e.player_id
		WHERE e.lan_id = ? ORDER BY p.name_key`, lanID)
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
			err := requireAreaInLAN(ctx, transaction, lanID, *areaID)
			if err != nil {
				return err
			}
		}
		result, err := transaction.ExecContext(ctx,
			`UPDATE lan_entries SET area_id = ? WHERE lan_id = ? AND player_id = ?`,
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

// insertArea writes one area and reports an unknown LAN.
func insertArea(ctx context.Context, transaction *sql.Tx, lanID int64, area rules.Area) error {
	_, err := transaction.ExecContext(ctx,
		`INSERT INTO lan_areas (lan_id, x, y, width, height) VALUES (?, ?, ?, ?, ?)`,
		lanID, area.X, area.Y, area.Width, area.Height)
	if err != nil && strings.Contains(err.Error(), "FOREIGN KEY") {
		return ErrLANNotFound
	}
	if err != nil {
		return fmt.Errorf("insert area: %w", err)
	}
	return nil
}

// loadAreas reads the room map of a LAN.
func loadAreas(ctx context.Context, database querier, lanID int64) ([]StageArea, error) {
	rows, err := database.QueryContext(ctx,
		`SELECT id, x, y, width, height FROM lan_areas WHERE lan_id = ? ORDER BY id`, lanID)
	if err != nil {
		return nil, fmt.Errorf("load areas: %w", err)
	}
	defer func() { _ = rows.Close() }()
	areas := []StageArea{}
	for rows.Next() {
		var area StageArea
		err := rows.Scan(&area.ID, &area.X, &area.Y, &area.Width, &area.Height)
		if err != nil {
			return nil, fmt.Errorf("read area: %w", err)
		}
		areas = append(areas, area)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load areas: %w", err)
	}
	return areas, nil
}

// requireAreaInLAN rejects an area that belongs to another LAN.
func requireAreaInLAN(ctx context.Context, database querier, lanID, areaID int64) error {
	var found int
	err := database.QueryRowContext(ctx,
		`SELECT 1 FROM lan_areas WHERE id = ? AND lan_id = ?`, areaID, lanID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrAreaNotFound
	}
	if err != nil {
		return fmt.Errorf("check area: %w", err)
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
