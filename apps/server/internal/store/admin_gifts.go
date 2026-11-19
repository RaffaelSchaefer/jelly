package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// GiveXP grants admin XP to a player or bot in its current LAN, as if it had earned it.
func (store *Store) GiveXP(ctx context.Context, playerID int64, amount int, now int64) error {
	if amount < 1 || amount > rules.MaxGivenXP {
		return ErrInvalidInput
	}
	_, err := store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		err := grantXP(ctx, action, xpEntry{
			action: xpSourceAdmin, amount: amount, eventCodeID: sql.NullInt64{},
		})
		if err != nil {
			return err
		}
		return recordAdminAction(ctx, action.transaction, AdminActionGiveXP, playerID, now)
	})
	return err
}

// GiveCoins grants admin coins to a player or bot in its current LAN. They vanish with the LAN,
// like every coin.
func (store *Store) GiveCoins(ctx context.Context, playerID int64, amount int, now int64) error {
	if amount < 1 || amount > maxGivenCoins {
		return ErrInvalidInput
	}
	_, err := store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		err := grantCoins(ctx, action, coinSourceAdmin, amount)
		if err != nil {
			return err
		}
		return recordAdminAction(ctx, action.transaction, AdminActionGiveCoins, playerID, now)
	})
	return err
}

// RefundPurchase takes one exact purchase back, refunds its stored price and takes the cosmetic
// off if the player wears it. Purchases exist only for what the shop sells.
func (store *Store) RefundPurchase(
	ctx context.Context, playerID, purchaseID, now int64,
) error {
	_, err := store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		price, err := loadPurchasePrice(ctx, action.transaction, purchaseID, playerID)
		if err != nil {
			return err
		}
		const deletePurchaseSQL = `DELETE FROM purchases WHERE id = ?`
		_, err = action.transaction.ExecContext(ctx, deletePurchaseSQL, purchaseID)
		if err != nil {
			return fmt.Errorf("delete purchase: %w", err)
		}
		err = grantCoins(ctx, action, coinSourceRefund, price)
		if err != nil {
			return err
		}
		err = removeLockedCosmetics(ctx, action.transaction, playerID, now)
		if err != nil {
			return err
		}
		return recordAdminAction(ctx, action.transaction, AdminActionRefundPurchase, playerID, now)
	})
	return err
}

// loadPurchasePrice reads the stored price of one purchase and makes sure it belongs to the
// player.
func loadPurchasePrice(
	ctx context.Context, transaction *sql.Tx, purchaseID, playerID int64,
) (int, error) {
	var price int
	const selectPurchasePriceSQL = `SELECT price FROM purchases WHERE id = ? AND player_id = ?`
	err := transaction.QueryRowContext(ctx, selectPurchasePriceSQL,
		purchaseID, playerID).Scan(&price)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrPurchaseNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("load purchase: %w", err)
	}
	return price, nil
}

// GrantAchievement gives a player or bot an achievement, also a secret one, as if it had earned
// it. An achievement it already has stays as it is.
func (store *Store) GrantAchievement(
	ctx context.Context,
	playerID int64,
	key string,
	now int64,
) error {
	if _, found := rules.FindAchievement(key); !found {
		return ErrInvalidInput
	}
	_, err := store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		err := grantAchievementOnce(ctx, action, key)
		if err != nil {
			return err
		}
		return recordAdminAction(ctx, action.transaction, AdminActionAchievement, playerID, now)
	})
	return err
}
