package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// purchaseConflictMessage marks the driver message of one of the unique purchase indexes, which
// two simultaneous purchases of the same cosmetic meet.
const purchaseConflictMessage = "UNIQUE constraint failed: purchases."

// purchasedPayload says what a player bought and what it cost.
type purchasedPayload struct {
	Key   string `json:"key"`
	Price int    `json:"price"`
}

// PurchaseAnswer tells what a purchase bought and how the player stands afterwards.
type PurchaseAnswer struct {
	CosmeticKey string      `json:"cosmetic_key"`
	CoinsSpent  int         `json:"coins_spent"`
	Me          PlayerState `json:"me"`
}

// PurchaseCosmetic buys a shop cosmetic with the coins of the running LAN. The cosmetic stays
// bought, but the purchase does not put it on.
func (store *Store) PurchaseCosmetic(
	ctx context.Context, playerID int64, key string, now int64,
) (PurchaseAnswer, error) {
	cosmetic, found := rules.FindCosmetic(key)
	if !found {
		return PurchaseAnswer{}, rules.ErrUnknownCosmetic
	}
	var answer PurchaseAnswer
	state, err := store.runPlayerAction(
		ctx,
		playerID,
		now,
		false,
		func(action actionContext) error {
			owned, err := ownsCosmetic(ctx, action.transaction, action.lan.id, playerID, cosmetic)
			if err != nil {
				return err
			}
			coins, err := loadCoins(ctx, action.transaction, action.lan.id, playerID)
			if err != nil {
				return err
			}
			err = rules.CheckPurchase(cosmetic, coins, owned)
			if err != nil {
				return err
			}
			err = recordPurchase(ctx, action, cosmetic)
			if err != nil {
				return err
			}
			err = spendCoins(ctx, action, cosmetic.Price)
			if err != nil {
				return err
			}
			answer = PurchaseAnswer{CosmeticKey: key, CoinsSpent: cosmetic.Price}
			return appendVisibleEvent(ctx, action, EventCosmeticPurchased,
				purchasedPayload{Key: key, Price: cosmetic.Price})
		},
	)
	if err != nil {
		return PurchaseAnswer{}, err
	}
	answer.Me = state
	return answer, nil
}

// ownsCosmetic reports whether this player already has the cosmetic, bought or awarded.
func ownsCosmetic(
	ctx context.Context, database querier, lanID, playerID int64, cosmetic rules.Cosmetic,
) (bool, error) {
	var purchased, awarded int
	const selectOwnedSQL = `SELECT
		(SELECT COUNT(*) FROM purchases
			WHERE player_id = ?1 AND cosmetic_key = ?2 AND lan_id IS ?3),
		(SELECT COUNT(*) FROM awards WHERE player_id = ?1 AND cosmetic_key = ?2)`
	err := database.QueryRowContext(ctx, selectOwnedSQL,
		playerID, cosmetic.Key, purchaseLAN(cosmetic.Scope, lanID)).Scan(&purchased, &awarded)
	if err != nil {
		return false, fmt.Errorf("load owned cosmetic: %w", err)
	}
	return purchased > 0 || awarded > 0, nil
}

// purchaseLAN returns the LAN of a purchase. A permanent purchase has none, so SQLite compares
// `lan_id IS NULL` and a purchase of a LAN cosmetic compares its LAN.
func purchaseLAN(scope rules.Scope, lanID int64) sql.NullInt64 {
	return sql.NullInt64{Int64: lanID, Valid: scope == rules.ScopeLAN}
}

// recordPurchase writes the purchase and answers the unique index with [rules.ErrAlreadyOwned]
// if another purchase of the same cosmetic slipped in first.
func recordPurchase(ctx context.Context, action actionContext, cosmetic rules.Cosmetic) error {
	const insertPurchaseSQL = `INSERT INTO purchases
		(player_id, lan_id, cosmetic_key, price, created_at) VALUES (?, ?, ?, ?, ?)`
	_, err := action.transaction.ExecContext(ctx, insertPurchaseSQL,
		action.playerID, purchaseLAN(cosmetic.Scope, action.lan.id), cosmetic.Key,
		cosmetic.Price, action.now)
	if err != nil && strings.Contains(err.Error(), purchaseConflictMessage) {
		return rules.ErrAlreadyOwned
	}
	if err != nil {
		return fmt.Errorf("record purchase: %w", err)
	}
	return nil
}

// findPurchase returns the purchase of one cosmetic that counts now, newest first.
func findPurchase(
	ctx context.Context, database querier, lanID, playerID int64, cosmetic rules.Cosmetic,
) (int64, int, error) {
	var purchaseID int64
	var price int
	const selectPurchaseSQL = `SELECT id, price FROM purchases
		WHERE player_id = ? AND cosmetic_key = ? AND lan_id IS ?`
	err := database.QueryRowContext(ctx, selectPurchaseSQL,
		playerID, cosmetic.Key, purchaseLAN(cosmetic.Scope, lanID)).Scan(&purchaseID, &price)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, 0, ErrPurchaseNotFound
	}
	if err != nil {
		return 0, 0, fmt.Errorf("load purchase: %w", err)
	}
	return purchaseID, price, nil
}

// purchaseRecord is one purchase as stored, without the catalog.
type purchaseRecord struct {
	key   string
	lanID sql.NullInt64
}

// countsForScope says whether a purchase counts now. A permanent one counts without a LAN, a
// purchase of a LAN cosmetic only in the LAN it was bought in.
func (record purchaseRecord) countsForScope(cosmetic rules.Cosmetic, newestLANID int64) bool {
	switch cosmetic.Scope {
	case rules.ScopePermanent:
		return !record.lanID.Valid
	case rules.ScopeLAN:
		return record.lanID.Valid && record.lanID.Int64 == newestLANID
	default:
		return false
	}
}

// loadPurchasedCosmetics returns the keys of bought cosmetics that count for the player, which
// are the permanent ones and those of the newest LAN.
func loadPurchasedCosmetics(
	ctx context.Context, database querier, playerID int64,
) ([]string, error) {
	records, loadErr := loadPurchaseRecords(ctx, database, playerID)
	if loadErr != nil {
		return nil, loadErr
	}
	newestLANID, err := loadNewestLANID(ctx, database, playerID)
	if err != nil {
		return nil, err
	}
	keys := []string{}
	for _, record := range records {
		cosmetic, found := rules.FindCosmetic(record.key)
		if found && record.countsForScope(cosmetic, newestLANID) {
			keys = append(keys, record.key)
		}
	}
	return keys, nil
}

// loadPurchaseRecords reads every purchase of a player, whatever its LAN.
func loadPurchaseRecords(
	ctx context.Context, database querier, playerID int64,
) ([]purchaseRecord, error) {
	const selectPurchasesSQL = `SELECT cosmetic_key, lan_id FROM purchases WHERE player_id = ?`
	rows, err := database.QueryContext(ctx, selectPurchasesSQL, playerID)
	if err != nil {
		return nil, fmt.Errorf("load purchases: %w", err)
	}
	defer func() { _ = rows.Close() }()
	records := []purchaseRecord{}
	for rows.Next() {
		var record purchaseRecord
		if err := rows.Scan(&record.key, &record.lanID); err != nil {
			return nil, fmt.Errorf("read purchase: %w", err)
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load purchases: %w", err)
	}
	return records, nil
}

// loadNewestLANID returns the LAN of the latest entry of a player, or 0 without one.
func loadNewestLANID(ctx context.Context, database querier, playerID int64) (int64, error) {
	var lanID sql.NullInt64
	const selectNewestLANSQL = `SELECT e.lan_id FROM lan_entries e JOIN lans l ON l.id = e.lan_id
		WHERE e.player_id = ? ORDER BY l.starts_at DESC LIMIT 1`
	scanErr := database.QueryRowContext(ctx, selectNewestLANSQL, playerID).Scan(&lanID)
	if errors.Is(scanErr, sql.ErrNoRows) {
		return 0, nil
	}
	if scanErr != nil {
		return 0, fmt.Errorf("load newest LAN: %w", scanErr)
	}
	if !lanID.Valid {
		return 0, nil
	}
	return lanID.Int64, nil
}
