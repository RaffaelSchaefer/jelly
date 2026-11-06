package store

import (
	"context"
	"database/sql"

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
