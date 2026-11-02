package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const (
	maxPlayerListRows = 200
	resetNamePrefix   = "Jelly-"
)

// PlayerSummary is a player as the admin page shows it.
type PlayerSummary struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Color      string `json:"color"`
	Hidden     bool   `json:"hidden"`
	TotalXP    int    `json:"total_xp"`
	LANs       int    `json:"lans"`
	LastSeenAt int64  `json:"last_seen_at"`
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
	rows, err := store.readDB.QueryContext(queryCtx, `SELECT p.id, p.name, p.color, p.hidden_at,
			COALESCE(SUM(e.xp), 0), COUNT(e.lan_id), COALESCE(MAX(e.last_seen_at), 0)
		FROM players p LEFT JOIN lan_entries e ON e.player_id = p.id
		WHERE p.name_key LIKE ? ESCAPE '\' GROUP BY p.id ORDER BY p.id DESC LIMIT ?`,
		pattern, maxPlayerListRows)
	if err != nil {
		return nil, fmt.Errorf("list players: %w", err)
	}
	defer func() { _ = rows.Close() }()
	players := []PlayerSummary{}
	for rows.Next() {
		var player PlayerSummary
		var hiddenAt sql.NullInt64
		err = rows.Scan(&player.ID, &player.Name, &player.Color, &hiddenAt, &player.TotalXP,
			&player.LANs, &player.LastSeenAt)
		if err != nil {
			return nil, fmt.Errorf("read player: %w", err)
		}
		player.Hidden = hiddenAt.Valid
		players = append(players, player)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list players: %w", err)
	}
	return players, nil
}

// HidePlayer takes a jelly off the stage. The player keeps the account and XP.
func (store *Store) HidePlayer(ctx context.Context, playerID, now int64) error {
	return store.updateModeration(ctx, playerID, now, now, EventPlayerHidden)
}

// ShowPlayer brings a hidden jelly back.
func (store *Store) ShowPlayer(ctx context.Context, playerID, now int64) error {
	return store.updateModeration(ctx, playerID, now, nil, EventPlayerActive)
}

// ResetPlayerName replaces a name with a neutral one built from the player ID.
func (store *Store) ResetPlayerName(ctx context.Context, playerID, now int64) error {
	name := resetNamePrefix + strconv.FormatInt(playerID, 10)
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		result, err := transaction.ExecContext(ctx,
			`UPDATE players SET name = ?, name_key = ? WHERE id = ?`,
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
		return appendEvent(ctx, transaction, eventRecord{
			lanID: 0, eventType: EventPlayerUpdated, scope: scopePlayer,
			playerID: playerID, payload: struct{}{}, now: now,
		})
	})
}

// RotatePlayerToken replaces the token of a lost account and returns the new one once.
func (store *Store) RotatePlayerToken(ctx context.Context, playerID int64) (string, error) {
	token := generateToken()
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		result, err := transaction.ExecContext(ctx,
			`UPDATE players SET token_hash = ? WHERE id = ?`, hashSecret(token), playerID)
		if err != nil {
			return fmt.Errorf("rotate token: %w", err)
		}
		return requireAffectedRow(result, ErrPlayerNotFound)
	})
	if err != nil {
		return "", err
	}
	return token, nil
}

// DeletePlayer removes an account with all its data and tells the stage.
func (store *Store) DeletePlayer(ctx context.Context, playerID, now int64) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		result, err := transaction.ExecContext(ctx, `DELETE FROM players WHERE id = ?`, playerID)
		if err != nil {
			return fmt.Errorf("delete player: %w", err)
		}
		err = requireAffectedRow(result, ErrPlayerNotFound)
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
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		return insertAward(ctx, transaction, award, now)
	})
}

// updateModeration sets the hidden state and tells the stage.
func (store *Store) updateModeration(
	ctx context.Context, playerID, now int64, hiddenAt any, eventType string,
) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		result, err := transaction.ExecContext(ctx,
			`UPDATE players SET hidden_at = ? WHERE id = ?`, hiddenAt, playerID)
		if err != nil {
			return fmt.Errorf("update moderation: %w", err)
		}
		err = requireAffectedRow(result, ErrPlayerNotFound)
		if err != nil {
			return err
		}
		return appendEvent(ctx, transaction, eventRecord{
			lanID: 0, eventType: eventType, scope: scopePublic,
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
	_, err = transaction.ExecContext(ctx, `INSERT INTO awards
		(player_id, lan_id, title, cosmetic_key, given_at) VALUES (?, ?, ?, ?, ?)`,
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
