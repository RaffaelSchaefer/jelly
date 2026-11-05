package store

import (
	"context"
	"database/sql"
	"fmt"
	"slices"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// EquippedCosmetic is what a jelly wears in one slot. Only colorable cosmetics have a color.
type EquippedCosmetic struct {
	Key   string  `json:"key"`
	Color *string `json:"color"`
}

// CosmeticChoice is a change to one slot. An empty key takes off what is in that slot.
type CosmeticChoice struct {
	Slot  string
	Key   string
	Color *string
}

// EquipCosmetic puts an unlocked cosmetic into its slot or empties the slot.
func (store *Store) EquipCosmetic(
	ctx context.Context, playerID int64, choice CosmeticChoice, now int64,
) (PlayerState, error) {
	err := rules.ValidateEquip(choice.Slot, choice.Key, choice.Color)
	if err != nil {
		return PlayerState{}, fmt.Errorf("validate cosmetic: %w", err)
	}
	var state PlayerState
	err = store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		workErr := writeCosmeticChoice(ctx, transaction, playerID, choice)
		if workErr != nil {
			return workErr
		}
		workErr = recordProfileEdit(ctx, transaction, playerID, now)
		if workErr != nil {
			return workErr
		}
		state, workErr = loadState(ctx, transaction, playerID, now)
		return workErr
	})
	if err != nil {
		return PlayerState{}, err
	}
	return state, nil
}

// writeCosmeticChoice checks the unlock and writes the slot.
func writeCosmeticChoice(
	ctx context.Context, transaction *sql.Tx, playerID int64, choice CosmeticChoice,
) error {
	if choice.Key == "" {
		return clearCosmeticSlot(ctx, transaction, playerID, choice.Slot)
	}
	unlocked, err := loadUnlockedCosmetics(ctx, transaction, playerID)
	if err != nil {
		return err
	}
	if !slices.Contains(unlocked, choice.Key) {
		return ErrCosmeticLocked
	}
	const upsertCosmeticSQL = `INSERT INTO player_cosmetics (player_id, slot, cosmetic_key, color)
		VALUES (?, ?, ?, ?)
		ON CONFLICT (player_id, slot) DO UPDATE
		SET cosmetic_key = excluded.cosmetic_key, color = excluded.color`
	_, err = transaction.ExecContext(ctx, upsertCosmeticSQL,
		playerID, choice.Slot, choice.Key, choice.Color)
	if err != nil {
		return fmt.Errorf("equip cosmetic: %w", err)
	}
	return nil
}

// clearCosmeticSlot empties one slot.
func clearCosmeticSlot(
	ctx context.Context, transaction *sql.Tx, playerID int64, slot string,
) error {
	const deleteCosmeticSQL = `DELETE FROM player_cosmetics WHERE player_id = ? AND slot = ?`
	_, err := transaction.ExecContext(ctx, deleteCosmeticSQL, playerID, slot)
	if err != nil {
		return fmt.Errorf("clear cosmetic: %w", err)
	}
	return nil
}

// removeLockedCosmetics takes off what no longer counts, such as the crown of the last LAN.
func removeLockedCosmetics(
	ctx context.Context, transaction *sql.Tx, playerID, now int64,
) error {
	equipped, err := loadEquipped(ctx, transaction, playerID)
	if err != nil {
		return err
	}
	unlocked, err := loadUnlockedCosmetics(ctx, transaction, playerID)
	if err != nil {
		return err
	}
	isChanged := false
	for slot, cosmetic := range equipped {
		if slices.Contains(unlocked, cosmetic.Key) {
			continue
		}
		err = clearCosmeticSlot(ctx, transaction, playerID, slot)
		if err != nil {
			return err
		}
		isChanged = true
	}
	if !isChanged {
		return nil
	}
	return appendEvent(ctx, transaction, eventRecord{
		lanID: 0, eventType: EventPlayerUpdated, scope: scopePublic,
		playerID: playerID, payload: struct{}{}, now: now,
	})
}

// loadEquipped returns what one player wears by slot.
func loadEquipped(
	ctx context.Context, database querier, playerID int64,
) (map[string]EquippedCosmetic, error) {
	const selectEquippedSQL = `SELECT player_id, slot, cosmetic_key, color
		FROM player_cosmetics WHERE player_id = ?`
	rows, err := database.QueryContext(ctx, selectEquippedSQL, playerID)
	if err != nil {
		return nil, fmt.Errorf("load cosmetics: %w", err)
	}
	defer func() { _ = rows.Close() }()
	byPlayer, err := readEquippedRows(rows)
	if err != nil {
		return nil, err
	}
	if equipped, found := byPlayer[playerID]; found {
		return equipped, nil
	}
	return map[string]EquippedCosmetic{}, nil
}

// loadEquippedInLAN returns what all players of a LAN wear, by player and slot.
func loadEquippedInLAN(
	ctx context.Context, database querier, lanID int64,
) (map[int64]map[string]EquippedCosmetic, error) {
	const selectLANEquippedSQL = `SELECT c.player_id, c.slot, c.cosmetic_key, c.color
		FROM player_cosmetics c JOIN lan_entries e ON e.player_id = c.player_id
		WHERE e.lan_id = ?`
	rows, err := database.QueryContext(ctx, selectLANEquippedSQL, lanID)
	if err != nil {
		return nil, fmt.Errorf("load cosmetics: %w", err)
	}
	defer func() { _ = rows.Close() }()
	return readEquippedRows(rows)
}

// readEquippedRows groups cosmetic rows by player and slot.
func readEquippedRows(rows *sql.Rows) (map[int64]map[string]EquippedCosmetic, error) {
	byPlayer := map[int64]map[string]EquippedCosmetic{}
	for rows.Next() {
		var playerID int64
		var slot string
		var cosmetic EquippedCosmetic
		err := rows.Scan(&playerID, &slot, &cosmetic.Key, &cosmetic.Color)
		if err != nil {
			return nil, fmt.Errorf("read cosmetic: %w", err)
		}
		if byPlayer[playerID] == nil {
			byPlayer[playerID] = map[string]EquippedCosmetic{}
		}
		byPlayer[playerID][slot] = cosmetic
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read cosmetics: %w", err)
	}
	return byPlayer, nil
}
