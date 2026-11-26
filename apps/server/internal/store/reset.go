package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// ResetPlayerProgress sends one account of a LAN back to a freshly joined jelly. The account, its
// entry, seat, permanent purchases, prizes and lifetime achievements stay.
func (store *Store) ResetPlayerProgress(ctx context.Context, lanID, playerID, now int64) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		err := requireLAN(ctx, transaction, lanID)
		if err != nil {
			return err
		}
		const selectEntrySQL = `SELECT 1 FROM lan_entries WHERE lan_id = ? AND player_id = ?`
		var found int
		err = transaction.QueryRowContext(ctx, selectEntrySQL, lanID, playerID).Scan(&found)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrPlayerNotFound
		}
		if err != nil {
			return fmt.Errorf("load entry: %w", err)
		}
		err = resetEntryProgress(ctx, transaction, lanID, playerID, now)
		if err != nil {
			return err
		}
		return recordAdminAction(ctx, transaction, AdminActionResetPlayer, playerID, now)
	})
}

// ResetLANProgress does the same for every account that joined the LAN.
func (store *Store) ResetLANProgress(ctx context.Context, lanID, now int64) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		err := requireLAN(ctx, transaction, lanID)
		if err != nil {
			return err
		}
		playerIDs, err := listEntryPlayerIDs(ctx, transaction, lanID)
		if err != nil {
			return err
		}
		for _, playerID := range playerIDs {
			err = resetEntryProgress(ctx, transaction, lanID, playerID, now)
			if err != nil {
				return err
			}
		}
		return recordAdminAction(ctx, transaction, AdminActionResetLAN, lanID, now)
	})
}

// listEntryPlayerIDs returns the players who joined a LAN.
func listEntryPlayerIDs(ctx context.Context, transaction *sql.Tx, lanID int64) ([]int64, error) {
	const selectEntryPlayersSQL = `SELECT player_id FROM lan_entries WHERE lan_id = ?`
	rows, err := transaction.QueryContext(ctx, selectEntryPlayersSQL, lanID)
	if err != nil {
		return nil, fmt.Errorf("list entries: %w", err)
	}
	defer func() { _ = rows.Close() }()
	playerIDs := []int64{}
	for rows.Next() {
		var playerID int64
		if err := rows.Scan(&playerID); err != nil {
			return nil, fmt.Errorf("read entry: %w", err)
		}
		playerIDs = append(playerIDs, playerID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list entries: %w", err)
	}
	return playerIDs, nil
}

// listResetStatements returns what an entry loses, with `?1` as the LAN and `?2` as the player.
// Permanent purchases and lifetime achievements (scope 0) stay, so do prizes.
func listResetStatements() []string {
	const deleteXPLogSQL = `DELETE FROM xp_log WHERE lan_id = ?1 AND player_id = ?2`
	const deleteCoinEntriesSQL = `DELETE FROM coin_entries WHERE lan_id = ?1 AND player_id = ?2`
	const deletePurchasesSQL = `DELETE FROM purchases WHERE lan_id = ?1 AND player_id = ?2`
	const deleteAchievementsSQL = `DELETE FROM achievements
		WHERE scope_lan_id = ?1 AND player_id = ?2`
	const deleteWornSQL = `DELETE FROM player_cosmetics WHERE player_id = ?2 AND ?1 > 0`
	const clearEntrySQL = `UPDATE lan_entries SET xp = 0, coins = 0
		WHERE lan_id = ?1 AND player_id = ?2`
	return []string{
		deleteXPLogSQL, deleteCoinEntriesSQL, deletePurchasesSQL, deleteAchievementsSQL,
		deleteWornSQL, clearEntrySQL,
	}
}

// resetEntryProgress clears state and history of one entry together and tells the player's app.
func resetEntryProgress(
	ctx context.Context, transaction *sql.Tx, lanID, playerID, now int64,
) error {
	for _, resetSQL := range listResetStatements() {
		_, err := transaction.ExecContext(ctx, resetSQL, lanID, playerID)
		if err != nil {
			return fmt.Errorf("reset progress: %w", err)
		}
	}
	return appendEvent(ctx, transaction, eventRecord{
		lanID: lanID, eventType: EventPlayerUpdated, scope: scopePublic,
		playerID: playerID, payload: struct{}{}, now: now,
	})
}
