package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// updatePlayerNameSQL is shared by players renaming themselves and admins resetting a name.
const updatePlayerNameSQL = `UPDATE players SET name = ?, name_key = ? WHERE id = ?`

// maxPlayerListRows keeps one page small enough for one query of its purchases.
const maxPlayerListRows = 200

// PlayerPurchase is a purchase as the admin page shows it.
type PlayerPurchase struct {
	CosmeticKey string `json:"cosmetic_key"`
	Price       int    `json:"price"`
	// LANID is the LAN of a purchase of a LAN cosmetic, and null for a permanent one.
	LANID     *int64 `json:"lan_id"`
	CreatedAt int64  `json:"created_at"`
}

// PlayerSummary is a player as the admin page shows it.
type PlayerSummary struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Color      string `json:"color"`
	IsBot      bool   `json:"is_bot"`
	Hidden     bool   `json:"hidden"`
	TotalXP    int    `json:"total_xp"`
	LANs       int    `json:"lans"`
	LastSeenAt int64  `json:"last_seen_at"`
	// Coins are the balance in the newest LAN of the account, 0 without one.
	Coins     int              `json:"coins"`
	Purchases []PlayerPurchase `json:"purchases"`
}

// NewAward describes a prize to give.
type NewAward struct {
	PlayerID    int64   `json:"player_id"`
	Title       string  `json:"title"`
	CosmeticKey *string `json:"cosmetic_key"`
}

// ListPlayers returns players whose name contains `search`, newest first.
func (store *Store) ListPlayers(ctx context.Context, search string) ([]PlayerSummary, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	escaper := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	pattern := "%" + escaper.Replace(rules.BuildNameKey(strings.TrimSpace(search))) + "%"
	const searchPlayersSQL = `SELECT p.id, p.name, p.color, p.is_bot, p.hidden_at,
			COALESCE(SUM(e.xp), 0), COUNT(e.lan_id), COALESCE(MAX(e.last_seen_at), 0),
			COALESCE((SELECT e2.coins FROM lan_entries e2 JOIN lans l2 ON l2.id = e2.lan_id
				WHERE e2.player_id = p.id ORDER BY l2.starts_at DESC LIMIT 1), 0)
		FROM players p LEFT JOIN lan_entries e ON e.player_id = p.id
		WHERE p.name_key LIKE ? ESCAPE '\' GROUP BY p.id ORDER BY p.id DESC LIMIT ?`
	rows, err := store.readDB.QueryContext(queryCtx, searchPlayersSQL,
		pattern, maxPlayerListRows)
	if err != nil {
		return nil, fmt.Errorf("list players: %w", err)
	}
	defer func() { _ = rows.Close() }()
	players := []PlayerSummary{}
	for rows.Next() {
		var player PlayerSummary
		var hiddenAt sql.NullInt64
		err = rows.Scan(&player.ID, &player.Name, &player.Color, &player.IsBot, &hiddenAt,
			&player.TotalXP,
			&player.LANs, &player.LastSeenAt, &player.Coins)
		if err != nil {
			return nil, fmt.Errorf("read player: %w", err)
		}
		player.Hidden = hiddenAt.Valid
		players = append(players, player)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("list players: %w", rowsErr)
	}
	purchaseErr := loadPurchasesOfPlayers(queryCtx, store.readDB, players)
	if purchaseErr != nil {
		return nil, purchaseErr
	}
	return players, nil
}

// loadPurchasesOfPlayers fills the purchases of every listed player with one query.
func loadPurchasesOfPlayers(
	ctx context.Context, database querier, players []PlayerSummary,
) error {
	if len(players) == 0 {
		return nil
	}
	places := strings.Repeat("?, ", len(players)-1) + "?"
	ids := make([]any, 0, len(players))
	byPlayer := make(map[int64][]PlayerPurchase, len(players))
	for _, player := range players {
		ids = append(ids, player.ID)
	}
	// selectPlayerPurchasesSQL frames the places of the IN list, which is as long as the page of
	// players.
	selectPlayerPurchasesSQL := `SELECT player_id, cosmetic_key, price, lan_id, created_at
		FROM purchases WHERE player_id IN (` + places + `) ORDER BY created_at`
	rows, err := database.QueryContext(ctx, selectPlayerPurchasesSQL, ids...)
	if err != nil {
		return fmt.Errorf("load purchases: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var purchase PlayerPurchase
		var playerID int64
		var lanID sql.NullInt64
		err = rows.Scan(&playerID, &purchase.CosmeticKey, &purchase.Price, &lanID,
			&purchase.CreatedAt)
		if err != nil {
			return fmt.Errorf("read purchase: %w", err)
		}
		if lanID.Valid {
			lan := lanID.Int64
			purchase.LANID = &lan
		}
		byPlayer[playerID] = append(byPlayer[playerID], purchase)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("load purchases: %w", err)
	}
	for index, player := range players {
		purchases := byPlayer[player.ID]
		if purchases == nil {
			purchases = []PlayerPurchase{}
		}
		players[index].Purchases = purchases
	}
	return nil
}

// HidePlayer takes a jelly off the stage. The player keeps the account and XP.
func (store *Store) HidePlayer(ctx context.Context, playerID, now int64) error {
	return store.updateModeration(ctx, playerID, now, now, moderationChange{
		eventType: EventPlayerHidden, adminAction: AdminActionHide,
	})
}

// ShowPlayer brings a hidden jelly back.
func (store *Store) ShowPlayer(ctx context.Context, playerID, now int64) error {
	return store.updateModeration(ctx, playerID, now, nil, moderationChange{
		eventType: EventPlayerActive, adminAction: AdminActionShow,
	})
}

// ResetPlayerName replaces a name with a neutral one built from the player ID.
func (store *Store) ResetPlayerName(ctx context.Context, playerID, now int64) error {
	name := rules.BuildResetName(playerID)
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		result, err := transaction.ExecContext(ctx, updatePlayerNameSQL,
			name, rules.BuildNameKey(name), playerID)
		if isNameConflict(err) {
			return ErrNameTaken
		}
		if err != nil {
			return fmt.Errorf("reset name: %w", err)
		}
		err = requireAffectedRow(result, ErrPlayerNotFound)
		if err != nil {
			return err
		}
		err = recordAdminAction(ctx, transaction, AdminActionResetName, playerID, now)
		if err != nil {
			return err
		}
		return appendEvent(ctx, transaction, eventRecord{
			lanID: 0, eventType: EventPlayerUpdated, scope: scopePublic,
			playerID: playerID, payload: struct{}{}, now: now,
		})
	})
}

// DeletePlayer removes an account with all its data and tells the stage.
func (store *Store) DeletePlayer(ctx context.Context, playerID, now int64) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		const deletePlayerSQL = `DELETE FROM players WHERE id = ?`
		result, err := transaction.ExecContext(ctx, deletePlayerSQL, playerID)
		if err != nil {
			return fmt.Errorf("delete player: %w", err)
		}
		err = requireAffectedRow(result, ErrPlayerNotFound)
		if err != nil {
			return err
		}
		err = recordAdminAction(ctx, transaction, AdminActionDelete, playerID, now)
		if err != nil {
			return err
		}
		return appendEvent(ctx, transaction, eventRecord{
			lanID: 0, eventType: EventPlayerRemoved, scope: scopePublic, playerID: 0,
			payload: map[string]int64{"player_id": playerID}, now: now,
		})
	})
}

// GiveAward stores a prize, optionally with a cosmetic that stays forever.
func (store *Store) GiveAward(ctx context.Context, award NewAward, now int64) error {
	award.Title = strings.TrimSpace(award.Title)
	if award.Title == "" {
		return ErrInvalidInput
	}
	if award.CosmeticKey != nil {
		err := rules.ValidateAwardCosmetic(*award.CosmeticKey)
		if err != nil {
			return fmt.Errorf("validate award cosmetic: %w", err)
		}
	}
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		err := insertAward(ctx, transaction, award, now)
		if err != nil {
			return err
		}
		return recordAdminAction(ctx, transaction, AdminActionAward, award.PlayerID, now)
	})
}

// moderationChange names what a change of the hidden state announces and logs.
type moderationChange struct {
	eventType   string
	adminAction string
}

// updateModeration sets the hidden state, logs it and tells the stage.
func (store *Store) updateModeration(
	ctx context.Context, playerID, now int64, hiddenAt any, change moderationChange,
) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		const updateHiddenAtSQL = `UPDATE players SET hidden_at = ? WHERE id = ?`
		result, err := transaction.ExecContext(ctx, updateHiddenAtSQL, hiddenAt, playerID)
		if err != nil {
			return fmt.Errorf("update moderation: %w", err)
		}
		err = requireAffectedRow(result, ErrPlayerNotFound)
		if err != nil {
			return err
		}
		err = recordAdminAction(ctx, transaction, change.adminAction, playerID, now)
		if err != nil {
			return err
		}
		return appendEvent(ctx, transaction, eventRecord{
			lanID: 0, eventType: change.eventType, scope: scopePublic,
			playerID: playerID, payload: struct{}{}, now: now,
		})
	})
}

// insertAward writes the prize and evaluates achievements if the player is in a running LAN.
func insertAward(ctx context.Context, transaction *sql.Tx, award NewAward, now int64) error {
	lan, err := loadActiveLAN(ctx, transaction, now)
	hasLAN := err == nil
	if err != nil && !errors.Is(err, ErrNoActiveLAN) {
		return err
	}
	var lanID any
	if hasLAN {
		lanID = lan.id
	}
	const insertAwardSQL = `INSERT INTO awards
		(player_id, lan_id, title, cosmetic_key, given_at) VALUES (?, ?, ?, ?, ?)`
	_, err = transaction.ExecContext(ctx, insertAwardSQL,
		award.PlayerID, lanID, award.Title, award.CosmeticKey, now)
	if err != nil && strings.Contains(err.Error(), "FOREIGN KEY") {
		return ErrPlayerNotFound
	}
	if err != nil {
		return fmt.Errorf("insert award: %w", err)
	}
	err = appendEvent(ctx, transaction, eventRecord{
		lanID: 0, eventType: EventAwardGiven, scope: scopePublic, playerID: award.PlayerID,
		payload: map[string]string{"title": award.Title}, now: now,
	})
	if err != nil || !hasLAN {
		return err
	}
	err = requireLANEntry(ctx, transaction, lan.id, award.PlayerID)
	if errors.Is(err, ErrNotJoined) {
		return nil
	}
	if err != nil {
		return err
	}
	return grantNewAchievements(ctx, transaction, achievementInput{
		lan: lan, playerID: award.PlayerID, now: now, restHours: 0, sessionHours: 0, isPoke: false,
	})
}
