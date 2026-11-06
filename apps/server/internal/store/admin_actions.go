package store

import (
	"context"
	"database/sql"
	"fmt"
)

// Actions the admin log records. Targets are IDs, so the log holds no names or secrets.
const (
	AdminActionHide      = "player.hide"
	AdminActionShow      = "player.show"
	AdminActionResetName = "player.reset_name"
	AdminActionDelete    = "player.delete"
	AdminActionAward     = "award.give"
	AdminActionRules     = "lan.rules"
	AdminActionJoinCode  = "lan.join_code"
	AdminActionEventCode = "event_code.create"
	AdminActionSeatCode  = "seat.code"
	AdminActionRecovery  = "player.recovery_code"
	AdminActionMapImport = "lan.map_import"
	AdminActionGathering = "lan.gathering"
	AdminActionLANUpdate = "lan.update"
	AdminActionLANDelete = "lan.delete"

	maxAdminActionRows = 200
)

// AdminAction is one entry of the admin log.
type AdminAction struct {
	ID        int64  `json:"id"`
	Action    string `json:"action"`
	TargetID  *int64 `json:"target_id"`
	CreatedAt int64  `json:"created_at"`
}

// ListAdminActions returns the newest entries of the admin log.
func (store *Store) ListAdminActions(ctx context.Context) ([]AdminAction, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	const selectAdminActionsSQL = `SELECT id, action, target_id, created_at
		FROM admin_actions ORDER BY id DESC LIMIT ?`
	rows, err := store.readDB.QueryContext(queryCtx, selectAdminActionsSQL, maxAdminActionRows)
	if err != nil {
		return nil, fmt.Errorf("list admin actions: %w", err)
	}
	defer func() { _ = rows.Close() }()
	actions := []AdminAction{}
	for rows.Next() {
		var action AdminAction
		var targetID sql.NullInt64
		err := rows.Scan(&action.ID, &action.Action, &targetID, &action.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("read admin action: %w", err)
		}
		if targetID.Valid {
			action.TargetID = &targetID.Int64
		}
		actions = append(actions, action)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list admin actions: %w", err)
	}
	return actions, nil
}

// recordAdminAction writes a log entry in the transaction of the action itself.
func recordAdminAction(
	ctx context.Context, transaction *sql.Tx, action string, targetID, now int64,
) error {
	const insertAdminActionSQL = `INSERT INTO admin_actions (action, target_id, created_at)
		VALUES (?, ?, ?)`
	_, err := transaction.ExecContext(ctx, insertAdminActionSQL,
		action, targetID, now)
	if err != nil {
		return fmt.Errorf("record admin action: %w", err)
	}
	return nil
}
