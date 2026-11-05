package store

import (
	"context"
	"database/sql"
	"fmt"
	"slices"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// MapImportReport says what importing a map changed.
type MapImportReport struct {
	Created []string `json:"created"`
	Updated []string `json:"updated"`
	Removed []string `json:"removed"`
	// UnknownProps are models the server does not know. The zones are imported anyway, and a stage
	// shows bare floor there.
	UnknownProps []string `json:"unknown_props"`
	// UnassignedPlayers counts the jellies that lost their place, because their zone is gone.
	UnassignedPlayers int `json:"unassigned_players"`
}

// mapImportRun is one import of a map into a LAN.
type mapImportRun struct {
	lanID  int64
	zones  []rules.MapZone
	report *MapImportReport
}

// importedZone is a zone of a LAN that came from a map file.
type importedZone struct {
	id   int64
	zone rules.MapZone
}

// ImportMap brings the zones of a LAN in line with a map file. Known zones keep their assignment
// and their seat code. Zones that were created by hand stay untouched. The caller has validated the
// map.
func (store *Store) ImportMap(
	ctx context.Context, lanID int64, roomMap rules.RoomMap, now int64,
) (MapImportReport, error) {
	report := MapImportReport{
		Created: []string{}, Updated: []string{}, Removed: []string{},
		UnknownProps: rules.ListUnknownProps(roomMap.Zones), UnassignedPlayers: 0,
	}
	run := mapImportRun{lanID: lanID, zones: roomMap.Zones, report: &report}
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		workErr := writeMapZones(ctx, transaction, run)
		if workErr != nil {
			return workErr
		}
		workErr = recordAdminAction(ctx, transaction, AdminActionMapImport, lanID, now)
		if workErr != nil {
			return workErr
		}
		return appendStageChanged(ctx, transaction, lanID, now)
	})
	if err != nil {
		return MapImportReport{}, err
	}
	return report, nil
}

// loadImportedZones returns the zones of a LAN that came from a map file, by their ID in that file.
func loadImportedZones(
	ctx context.Context, transaction *sql.Tx, lanID int64,
) (map[string]importedZone, error) {
	const selectImportedZonesSQL = `SELECT id, map_id, name, x, y, width, height, blocks, prop
		FROM lan_areas WHERE lan_id = ? AND map_id IS NOT NULL`
	rows, err := transaction.QueryContext(ctx, selectImportedZonesSQL, lanID)
	if err != nil {
		return nil, fmt.Errorf("load imported zones: %w", err)
	}
	defer func() { _ = rows.Close() }()
	known := map[string]importedZone{}
	for rows.Next() {
		var item importedZone
		err = rows.Scan(&item.id, &item.zone.ID, &item.zone.Name, &item.zone.X, &item.zone.Y,
			&item.zone.Width, &item.zone.Height, &item.zone.Blocks, &item.zone.Prop)
		if err != nil {
			return nil, fmt.Errorf("read imported zone: %w", err)
		}
		known[item.zone.ID] = item
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("load imported zones: %w", err)
	}
	return known, nil
}

// writeMapZones creates, updates and removes zones until the LAN matches the map.
func writeMapZones(ctx context.Context, transaction *sql.Tx, run mapImportRun) error {
	known, err := loadImportedZones(ctx, transaction, run.lanID)
	if err != nil {
		return err
	}
	for _, zone := range run.zones {
		err = writeMapZone(ctx, transaction, run, zone, known)
		if err != nil {
			return err
		}
		delete(known, zone.ID)
	}
	for mapID, gone := range known {
		err = removeMapZone(ctx, transaction, run.lanID, gone.id, run.report)
		if err != nil {
			return err
		}
		run.report.Removed = append(run.report.Removed, mapID)
	}
	slices.Sort(run.report.Removed)
	return nil
}

// writeMapZone creates a new zone or updates a known one that changed.
func writeMapZone(
	ctx context.Context,
	transaction *sql.Tx,
	run mapImportRun,
	zone rules.MapZone,
	known map[string]importedZone,
) error {
	current, isKnown := known[zone.ID]
	if !isKnown {
		run.report.Created = append(run.report.Created, zone.ID)
		return insertMapZone(ctx, transaction, run.lanID, zone)
	}
	if current.zone == zone {
		return nil
	}
	run.report.Updated = append(run.report.Updated, zone.ID)
	return updateMapZone(ctx, transaction, current.id, zone)
}

// insertMapZone writes a zone the LAN does not have yet.
func insertMapZone(
	ctx context.Context, transaction *sql.Tx, lanID int64, zone rules.MapZone,
) error {
	_, err := insertArea(ctx, transaction, lanID, AdminArea{
		ID: 0, Area: zone.ToArea(), Name: zone.Name, MapID: zone.ID,
	})
	return err
}

// updateMapZone takes over what the map says about a zone and leaves its assignment alone.
func updateMapZone(
	ctx context.Context, transaction *sql.Tx, areaID int64, zone rules.MapZone,
) error {
	const updateMapZoneSQL = `UPDATE lan_areas
		SET name = ?, x = ?, y = ?, width = ?, height = ?, blocks = ?, prop = ? WHERE id = ?`
	_, err := transaction.ExecContext(ctx, updateMapZoneSQL, zone.Name, zone.X, zone.Y, zone.Width,
		zone.Height, zone.Blocks, zone.Prop, areaID)
	if err != nil {
		return fmt.Errorf("update map zone: %w", err)
	}
	return nil
}

// removeMapZone deletes a zone that the map no longer has. Its jellies lose their place.
func removeMapZone(
	ctx context.Context, transaction *sql.Tx, lanID, areaID int64, report *MapImportReport,
) error {
	var players int
	const countZonePlayersSQL = `SELECT COUNT(*) FROM lan_entries WHERE lan_id = ? AND area_id = ?`
	err := transaction.QueryRowContext(ctx, countZonePlayersSQL, lanID, areaID).Scan(&players)
	if err != nil {
		return fmt.Errorf("count zone players: %w", err)
	}
	report.UnassignedPlayers += players
	err = clearAreaAssignments(ctx, transaction, lanID, areaID)
	if err != nil {
		return err
	}
	const deleteMapZoneSQL = `DELETE FROM lan_areas WHERE id = ?`
	_, err = transaction.ExecContext(ctx, deleteMapZoneSQL, areaID)
	if err != nil {
		return fmt.Errorf("delete map zone: %w", err)
	}
	return nil
}
