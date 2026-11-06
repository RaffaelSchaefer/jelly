package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const (
	// maxBotsPerCall keeps one click from filling a LAN by accident.
	maxBotsPerCall = 100
	botNamePrefix  = "Bot-"
	// xpSourceAdmin marks XP that an admin gave directly.
	xpSourceAdmin = "admin"
)

// BotSummary is a bot as the admin page lists it.
type BotSummary struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	XP   int    `json:"xp"`
}

// CreateBots creates accounts that count as normal players and joins them to a LAN.
func (store *Store) CreateBots(ctx context.Context, lanID int64, count int, now int64) error {
	if count < 1 || count > maxBotsPerCall {
		return ErrInvalidInput
	}
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		err := requireLAN(ctx, transaction, lanID)
		if err != nil {
			return err
		}
		target, err := loadCodeLAN(ctx, transaction, lanID)
		if err != nil {
			return err
		}
		colors := rules.ListColors()
		for index := range count {
			err = createBot(ctx, transaction, target, colors[index%len(colors)].Key, now)
			if err != nil {
				return err
			}
		}
		return nil
	})
}

// createBot writes one bot. Its secret is never shown, nobody logs in as a bot.
func createBot(
	ctx context.Context, transaction *sql.Tx, target codeLAN, color string, now int64,
) error {
	var lastID int64
	const selectLastPlayerSQL = `SELECT COALESCE(MAX(id), 0) FROM players`
	err := transaction.QueryRowContext(ctx, selectLastPlayerSQL).Scan(&lastID)
	if err != nil {
		return fmt.Errorf("read last player: %w", err)
	}
	playerID, err := insertPlayer(ctx, transaction, newPlayer{
		token: generateToken(), name: fmt.Sprintf("%s%d", botNamePrefix, lastID+1),
		color: color, now: now,
	})
	if err != nil {
		return err
	}
	const markBotSQL = `UPDATE players SET is_bot = 1 WHERE id = ?`
	_, err = transaction.ExecContext(ctx, markBotSQL, playerID)
	if err != nil {
		return fmt.Errorf("mark bot: %w", err)
	}
	return joinLAN(ctx, transaction, target, playerID, now)
}

// ListBots returns the bots of a LAN, the oldest first, so that the same ones play automatically.
func (store *Store) ListBots(ctx context.Context, lanID int64) ([]BotSummary, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	const selectBotsSQL = `SELECT p.id, p.name, e.xp FROM players p
		JOIN lan_entries e ON e.player_id = p.id
		WHERE p.is_bot = 1 AND e.lan_id = ? ORDER BY p.id`
	rows, err := store.readDB.QueryContext(queryCtx, selectBotsSQL, lanID)
	if err != nil {
		return nil, fmt.Errorf("list bots: %w", err)
	}
	defer func() { _ = rows.Close() }()
	bots := []BotSummary{}
	for rows.Next() {
		var bot BotSummary
		err = rows.Scan(&bot.ID, &bot.Name, &bot.XP)
		if err != nil {
			return nil, fmt.Errorf("read bot: %w", err)
		}
		bots = append(bots, bot)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("list bots: %w", err)
	}
	return bots, nil
}

// RequireBot refuses everyone who is no bot, so that the admin cannot act for real players.
func (store *Store) RequireBot(ctx context.Context, playerID int64) error {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	var isBot bool
	const selectIsBotSQL = `SELECT is_bot FROM players WHERE id = ?`
	err := store.readDB.QueryRowContext(queryCtx, selectIsBotSQL, playerID).Scan(&isBot)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !isBot) {
		return ErrNotABot
	}
	if err != nil {
		return fmt.Errorf("check bot: %w", err)
	}
	return nil
}

// GiveXP grants XP to a bot in its current LAN, as if it had earned it.
func (store *Store) GiveXP(ctx context.Context, playerID int64, amount int, now int64) error {
	if amount < 1 || amount > rules.MaxGivenXP {
		return ErrInvalidInput
	}
	_, err := store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		return grantXP(ctx, action, xpEntry{
			action: xpSourceAdmin, amount: amount, eventCodeID: sql.NullInt64{},
		})
	})
	return err
}

// DeleteBots deletes every bot with everything it did, and returns how many there were.
func (store *Store) DeleteBots(ctx context.Context, now int64) (int, error) {
	botIDs, err := store.listBotIDs(ctx)
	if err != nil {
		return 0, err
	}
	for _, botID := range botIDs {
		err = store.DeletePlayer(ctx, botID, now)
		if err != nil && !errors.Is(err, ErrPlayerNotFound) {
			return 0, err
		}
	}
	return len(botIDs), nil
}

// listBotIDs returns the IDs of all bots of every LAN.
func (store *Store) listBotIDs(ctx context.Context) ([]int64, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	const selectBotIDsSQL = `SELECT id FROM players WHERE is_bot = 1 ORDER BY id`
	rows, err := store.readDB.QueryContext(queryCtx, selectBotIDsSQL)
	if err != nil {
		return nil, fmt.Errorf("list bot IDs: %w", err)
	}
	defer func() { _ = rows.Close() }()
	botIDs := []int64{}
	for rows.Next() {
		var botID int64
		err = rows.Scan(&botID)
		if err != nil {
			return nil, fmt.Errorf("read bot ID: %w", err)
		}
		botIDs = append(botIDs, botID)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("list bot IDs: %w", err)
	}
	return botIDs, nil
}

// ListRunningBots returns the bots of the running LAN, none between LANs.
func (store *Store) ListRunningBots(ctx context.Context, now int64) ([]BotSummary, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	lan, err := loadActiveLAN(queryCtx, store.readDB, now)
	cancel()
	if errors.Is(err, ErrNoActiveLAN) {
		return []BotSummary{}, nil
	}
	if err != nil {
		return nil, err
	}
	return store.ListBots(ctx, lan.id)
}
