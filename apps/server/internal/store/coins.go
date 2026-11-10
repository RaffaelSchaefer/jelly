package store

import (
	"context"
	"fmt"
)

// Where a change of the balance comes from. A purchase takes coins off, so it writes its own
// entry with a negative amount and without an announcement.
const (
	coinSourceLevel    = "level"
	coinSourceAdmin    = "admin"
	coinSourceRefund   = "refund"
	coinSourcePurchase = "purchase"
	// maxGivenCoins is plenty for one gift by an admin and keeps a typo small.
	maxGivenCoins = 1000
)

// coinsGainedPayload says how many coins a player got and for what.
type coinsGainedPayload struct {
	Amount int    `json:"amount"`
	Source string `json:"source"`
}

// insertCoinEntrySQL writes one line of the balance history. It is shared by the grant and the
// spend, so both always write the same shape.
const insertCoinEntrySQL = `INSERT INTO coin_entries
	(lan_id, player_id, source, amount, created_at) VALUES (?, ?, ?, ?, ?)`

// grantCoins adds to the balance, writes the history and announces the gain.
func grantCoins(ctx context.Context, action actionContext, source string, amount int) error {
	const addCoinsSQL = `UPDATE lan_entries SET coins = coins + ?
		WHERE lan_id = ? AND player_id = ?`
	_, err := action.transaction.ExecContext(ctx, addCoinsSQL,
		amount, action.lan.id, action.playerID)
	if err != nil {
		return fmt.Errorf("add coins: %w", err)
	}
	_, err = action.transaction.ExecContext(ctx, insertCoinEntrySQL,
		action.lan.id, action.playerID, source, amount, action.now)
	if err != nil {
		return fmt.Errorf("write coin history: %w", err)
	}
	return appendVisibleEvent(ctx, action, EventCoinsGained,
		coinsGainedPayload{Amount: amount, Source: source})
}

// spendCoins takes the price off the balance and writes the history, without an announcement.
func spendCoins(ctx context.Context, action actionContext, amount int) error {
	const takeCoinsSQL = `UPDATE lan_entries SET coins = coins - ?
		WHERE lan_id = ? AND player_id = ?`
	_, err := action.transaction.ExecContext(ctx, takeCoinsSQL,
		amount, action.lan.id, action.playerID)
	if err != nil {
		return fmt.Errorf("take coins: %w", err)
	}
	_, err = action.transaction.ExecContext(ctx, insertCoinEntrySQL,
		action.lan.id, action.playerID, coinSourcePurchase, -amount, action.now)
	if err != nil {
		return fmt.Errorf("write coin history: %w", err)
	}
	return nil
}

// loadCoins reads the balance of a player in one LAN.
func loadCoins(ctx context.Context, database querier, lanID, playerID int64) (int, error) {
	var coins int
	const selectCoinsSQL = `SELECT coins FROM lan_entries WHERE lan_id = ? AND player_id = ?`
	err := database.QueryRowContext(ctx, selectCoinsSQL, lanID, playerID).Scan(&coins)
	if err != nil {
		return 0, fmt.Errorf("load coins: %w", err)
	}
	return coins, nil
}
