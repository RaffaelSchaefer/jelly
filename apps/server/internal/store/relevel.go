package store

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// levelHolder is what a jelly of a LAN has toward its level.
type levelHolder struct {
	playerID  int64
	earnedXP  int
	paidCoins int
	hidden    bool
}

// RelevelLAN replaces the rules of a LAN even after its start, when the level rules are locked.
// Every jelly keeps its XP, gets its level from the new rules and the level coins it still misses.
func (store *Store) RelevelLAN(
	ctx context.Context, lanID int64, gameRules rules.Rules, now int64,
) error {
	err := rules.ValidateRules(gameRules)
	if err != nil {
		return fmt.Errorf("validate rules: %w", err)
	}
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		stored, workErr := loadLANRules(ctx, transaction, lanID)
		if workErr != nil {
			return workErr
		}
		workErr = writeLANRules(ctx, transaction, lanID, gameRules, now)
		if workErr != nil {
			return workErr
		}
		holders, workErr := loadLevelHolders(ctx, transaction, lanID)
		if workErr != nil {
			return workErr
		}
		lan := activeLAN{id: lanID, timezone: "", gameRules: gameRules}
		for _, holder := range holders {
			workErr = settleLevel(ctx, transaction, lan, stored, holder, now)
			if workErr != nil {
				return workErr
			}
		}
		return nil
	})
}

// settleLevel announces a level the new rules raise and pays the level coins a jelly misses.
func settleLevel(
	ctx context.Context, transaction *sql.Tx, lan activeLAN, stored rules.Rules,
	holder levelHolder, now int64,
) error {
	action := actionContext{
		transaction: transaction, lan: lan, playerID: holder.playerID, now: now,
		restHours: 0, sessionHours: 0, hidden: holder.hidden,
	}
	level := rules.CalculateLevel(lan.gameRules, holder.earnedXP)
	if level > rules.CalculateLevel(stored, holder.earnedXP) {
		err := appendVisibleEvent(ctx, action, EventLevelUp, levelUpPayload{Level: level})
		if err != nil {
			return err
		}
	}
	missing := rules.CalculateMissingLevelCoins(lan.gameRules, holder.earnedXP, holder.paidCoins)
	if missing == 0 {
		return nil
	}
	return grantCoins(ctx, action, coinSourceLevel, missing)
}

// loadLevelHolders reads every jelly of a LAN with its XP and the level coins it got so far.
func loadLevelHolders(ctx context.Context, database querier, lanID int64) ([]levelHolder, error) {
	const selectLevelHoldersSQL = `SELECT e.player_id, e.xp, p.hidden_at IS NOT NULL,
		COALESCE((SELECT SUM(c.amount) FROM coin_entries c
			WHERE c.lan_id = e.lan_id AND c.player_id = e.player_id AND c.source = ?), 0)
		FROM lan_entries e JOIN players p ON p.id = e.player_id
		WHERE e.lan_id = ? ORDER BY e.player_id`
	rows, err := database.QueryContext(ctx, selectLevelHoldersSQL, coinSourceLevel, lanID)
	if err != nil {
		return nil, fmt.Errorf("load level holders: %w", err)
	}
	defer func() { _ = rows.Close() }()
	holders := []levelHolder{}
	for rows.Next() {
		var holder levelHolder
		err = rows.Scan(&holder.playerID, &holder.earnedXP, &holder.hidden, &holder.paidCoins)
		if err != nil {
			return nil, fmt.Errorf("read level holder: %w", err)
		}
		holders = append(holders, holder)
	}
	err = rows.Err()
	if err != nil {
		return nil, fmt.Errorf("read level holders: %w", err)
	}
	return holders, nil
}
