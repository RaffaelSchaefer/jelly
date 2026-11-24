package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// WizardHat is the hat of the wizard in the shop while a jelly of the LAN wears it.
type WizardHat struct {
	HolderID   int64  `json:"holder_id"`
	HolderName string `json:"holder_name"`
	EndsAt     int64  `json:"ends_at"`
}

// wizardHatChange is the payload of `wizard_hat.changed`. `Worn` is false once the hat is back.
// Like
// every event it holds no name, the state of the LAN names the holder.
type wizardHatChange struct {
	HolderID int64 `json:"holder_id"`
	EndsAt   int64 `json:"ends_at"`
	Worn     bool  `json:"worn"`
}

// StealWizardHat lets a jelly take the hat of the wizard, if nobody else wears it. Taking it again
// changes nothing. A hidden jelly is off the stage, so it cannot wear the hat.
func (store *Store) StealWizardHat(ctx context.Context, playerID, now int64) (PlayerState, error) {
	return store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		if action.hidden {
			return nil
		}
		worn, err := loadRunningWizardHat(ctx, action.transaction, action.lan.id, now)
		if err != nil {
			return err
		}
		if worn != nil && worn.HolderID == playerID {
			return nil
		}
		if worn != nil {
			return ErrWizardHatTaken
		}
		return takeWizardHat(ctx, action)
	})
}

// takeWizardHat gives the hat to the player and replaces a row whose time is over.
func takeWizardHat(ctx context.Context, action actionContext) error {
	endsAt := rules.CalculateWizardHatEnd(action.lan.gameRules, action.now)
	const upsertWizardHatSQL = `INSERT INTO wizard_hats (lan_id, player_id, ends_at)
		VALUES (?, ?, ?)
		ON CONFLICT (lan_id) DO UPDATE
		SET player_id = excluded.player_id, ends_at = excluded.ends_at`
	_, err := action.transaction.ExecContext(ctx, upsertWizardHatSQL,
		action.lan.id, action.playerID, endsAt)
	if err != nil {
		return fmt.Errorf("take wizard hat: %w", err)
	}
	err = appendVisibleEvent(ctx, action, EventWizardHatChanged,
		wizardHatChange{HolderID: action.playerID, EndsAt: endsAt, Worn: true})
	if err != nil {
		return err
	}
	return grantAchievementOnce(ctx, action, rules.AchievementHatThief)
}

// loadRunningWizardHat returns who wears the hat in a LAN right now, or nil if it is free. A hat
// of a hidden jelly or of one that left the LAN counts as free.
func loadRunningWizardHat(
	ctx context.Context, database querier, lanID, now int64,
) (*WizardHat, error) {
	var hat WizardHat
	const selectWizardHatSQL = `SELECT h.player_id, p.name, h.ends_at FROM wizard_hats h
		JOIN players p ON p.id = h.player_id
		JOIN lan_entries e ON e.lan_id = h.lan_id AND e.player_id = h.player_id
		WHERE h.lan_id = ? AND h.ends_at > ? AND p.hidden_at IS NULL`
	err := database.QueryRowContext(ctx, selectWizardHatSQL, lanID, now).
		Scan(&hat.HolderID, &hat.HolderName, &hat.EndsAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil //nolint:nilnil // A free hat is a normal state, not an error.
	}
	if err != nil {
		return nil, fmt.Errorf("load wizard hat: %w", err)
	}
	return &hat, nil
}

// addWizardHat adds the hat of a running LAN to a state, and on the head of its holder.
func addWizardHat(
	ctx context.Context, database querier, state *PlayerState, lanID, now int64,
) error {
	hat, err := loadRunningWizardHat(ctx, database, lanID, now)
	if err != nil {
		return err
	}
	state.WizardHat = hat
	if hat != nil && hat.HolderID == state.ID {
		state.Equipped = wearWizardHat(state.Equipped)
	}
	return nil
}

// wearWizardHat puts the hat over what the jelly wears on its head. Its own choice stays stored
// and comes back with the end of the hat.
func wearWizardHat(equipped map[string]EquippedCosmetic) map[string]EquippedCosmetic {
	if equipped == nil {
		equipped = map[string]EquippedCosmetic{}
	}
	equipped[rules.SlotHead] = EquippedCosmetic{Key: rules.CosmeticWizardHat, Color: nil}
	return equipped
}

// finishWizardHat gives back a hat whose time is over and announces it as its holder, so a hidden
// jelly stays quiet. It reads the row again, because a jelly may have taken it in the meantime.
func finishWizardHat(ctx context.Context, action actionContext) error {
	ended := wizardHatChange{HolderID: 0, EndsAt: 0, Worn: false}
	const selectEndedWizardHatSQL = `SELECT player_id, ends_at FROM wizard_hats
		WHERE lan_id = ? AND ends_at <= ?`
	err := action.transaction.QueryRowContext(ctx, selectEndedWizardHatSQL,
		action.lan.id, action.now).Scan(&ended.HolderID, &ended.EndsAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load expired wizard hat: %w", err)
	}
	const deleteWizardHatSQL = `DELETE FROM wizard_hats WHERE lan_id = ?`
	_, err = action.transaction.ExecContext(ctx, deleteWizardHatSQL, action.lan.id)
	if err != nil {
		return fmt.Errorf("delete expired wizard hat: %w", err)
	}
	holder, err := loadOtherPlayerAction(ctx, action, ended.HolderID)
	if err != nil {
		return err
	}
	return appendVisibleEvent(ctx, holder, EventWizardHatChanged, ended)
}
