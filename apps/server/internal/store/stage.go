package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// StagePlayer is a jelly as the stage shows it.
type StagePlayer struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`
	Color          string  `json:"color"`
	Cosmetic       *string `json:"cosmetic"`
	Level          int     `json:"level"`
	Sign           *string `json:"sign"`
	FollowPlayerID *int64  `json:"follow_player_id"`
	LastSeenAt     int64   `json:"last_seen_at"`
}

// StageState is everything the stage needs to start, the response of `GET /state`.
type StageState struct {
	LastEventID int64         `json:"last_event_id"`
	Players     []StagePlayer `json:"players"`
}

// LoadStageState returns all visible jellies of the running LAN. The event ID is read first, so
// a later change is replayed rather than lost.
func (store *Store) LoadStageState(ctx context.Context, now int64) (StageState, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	latestID, err := loadLatestEventID(queryCtx, store.readDB)
	if err != nil {
		return StageState{}, err
	}
	state := StageState{LastEventID: latestID, Players: []StagePlayer{}}
	lan, err := loadActiveLAN(queryCtx, store.readDB, now)
	if errors.Is(err, ErrNoActiveLAN) {
		return state, nil
	}
	if err != nil {
		return StageState{}, err
	}
	state.Players, err = loadStagePlayers(queryCtx, store.readDB, lan, now)
	if err != nil {
		return StageState{}, err
	}
	return state, nil
}

// loadStagePlayers reads the jellies that are visible and recently active.
func loadStagePlayers(
	ctx context.Context, database querier, lan activeLAN, now int64,
) ([]StagePlayer, error) {
	rows, err := database.QueryContext(ctx, `SELECT p.id, p.name, p.color, p.cosmetic_key, e.xp,
			e.sign_key, e.follow_player_id, e.last_seen_at
		FROM lan_entries e JOIN players p ON p.id = e.player_id
		WHERE e.lan_id = ? AND p.hidden_at IS NULL ORDER BY p.id`, lan.id)
	if err != nil {
		return nil, fmt.Errorf("load stage players: %w", err)
	}
	defer func() { _ = rows.Close() }()
	players := []StagePlayer{}
	for rows.Next() {
		player, err := scanStagePlayer(rows)
		if err != nil {
			return nil, err
		}
		if rules.IsPresent(lan.gameRules, player.LastSeenAt, now) {
			players = append(players, player)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load stage players: %w", err)
	}
	return players, nil
}

// scanStagePlayer reads one jelly row.
func scanStagePlayer(rows *sql.Rows) (StagePlayer, error) {
	var player StagePlayer
	var lanXP int
	var cosmetic, sign sql.NullString
	var follow sql.NullInt64
	err := rows.Scan(&player.ID, &player.Name, &player.Color, &cosmetic, &lanXP, &sign, &follow,
		&player.LastSeenAt)
	if err != nil {
		return StagePlayer{}, fmt.Errorf("read stage player: %w", err)
	}
	player.Level = rules.CalculateLevel(lanXP)
	if cosmetic.Valid {
		player.Cosmetic = &cosmetic.String
	}
	if sign.Valid {
		player.Sign = &sign.String
	}
	if follow.Valid {
		player.FollowPlayerID = &follow.Int64
	}
	return player, nil
}
