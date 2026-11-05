package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// LANInfo is the description of a LAN that players can see.
type LANInfo struct {
	Slug   string `json:"slug"`
	Name   string `json:"name"`
	Active bool   `json:"active"`
}

// Badge shows that a player attended a LAN.
type Badge struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// EarnedAchievement is an achievement in the history of a player.
type EarnedAchievement struct {
	Key      string  `json:"key"`
	Title    string  `json:"title"`
	LANSlug  *string `json:"lan_slug"`
	EarnedAt int64   `json:"earned_at"`
	// Best is the personal record and RecordUnit its unit, empty for normal achievements.
	Best       int    `json:"best,omitempty"`
	RecordUnit string `json:"record_unit,omitempty"`
}

// PlayerAward is a prize in the history of a player.
type PlayerAward struct {
	Title       string  `json:"title"`
	CosmeticKey *string `json:"cosmetic_key"`
	GivenAt     int64   `json:"given_at"`
}

// PlayerState is the state of one player, the response of `GET /me`.
type PlayerState struct {
	// ServerTime lets a client with a wrong clock show correct countdowns.
	ServerTime int64 `json:"server_time"`
	// LastEventID is where a client opens the stream to miss nothing after this state.
	LastEventID    int64                       `json:"last_event_id"`
	ID             int64                       `json:"id"`
	Name           string                      `json:"name"`
	Color          string                      `json:"color"`
	Equipped       map[string]EquippedCosmetic `json:"equipped"`
	Hidden         bool                        `json:"hidden"`
	LAN            *LANInfo                    `json:"lan"`
	XP             int                         `json:"xp"`
	Level          int                         `json:"level"`
	TotalXP        int                         `json:"total_xp"`
	NextPokeAt     *int64                      `json:"next_poke_at"`
	Reports        *rules.ReportStatus         `json:"reports"`
	Sign           *string                     `json:"sign"`
	FollowPlayerID *int64                      `json:"follow_player_id"`
	FollowUntil    *int64                      `json:"follow_until"`
	Trip           *Trip                       `json:"trip"`
	LANsAttended   int                         `json:"lans_attended"`
	Badges         []Badge                     `json:"badges"`
	Cosmetics      []string                    `json:"cosmetics"`
	Achievements   []EarnedAchievement         `json:"achievements"`
	Awards         []PlayerAward               `json:"awards"`
}

// entryRow is the latest entry as stored in the database.
type entryRow struct {
	lanID           int64
	info            LANInfo
	startsAt        int64
	endsAt          int64
	rulesJSON       string
	joinedAt        int64
	xp              int
	sign            sql.NullString
	follow          sql.NullInt64
	trip            tripColumns
	followStartedAt int64
}

// LoadPlayerState returns the state of a player.
func (store *Store) LoadPlayerState(ctx context.Context, playerID, now int64) (PlayerState, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	return loadState(queryCtx, store.readDB, playerID, now)
}

// loadState builds the state from the account, its latest entry and its history.
func loadState(ctx context.Context, database querier, playerID, now int64) (PlayerState, error) {
	// Read first, so a later change is replayed rather than lost.
	latestID, err := loadLatestEventID(ctx, database)
	if err != nil {
		return PlayerState{}, err
	}
	state, err := loadAccount(ctx, database, playerID)
	if err != nil {
		return PlayerState{}, err
	}
	state.ServerTime = now
	state.LastEventID = latestID
	state.Level = rules.CalculateLevel(0)
	err = loadProgress(ctx, database, &state, now)
	if err != nil {
		return PlayerState{}, err
	}
	state.Cosmetics, err = loadUnlockedCosmetics(ctx, database, playerID)
	if err != nil {
		return PlayerState{}, err
	}
	state.Badges, err = loadBadges(ctx, database, playerID)
	if err != nil {
		return PlayerState{}, err
	}
	state.Achievements, err = loadAchievementHistory(ctx, database, playerID)
	if err != nil {
		return PlayerState{}, err
	}
	state.Awards, err = loadPlayerAwards(ctx, database, playerID)
	if err != nil {
		return PlayerState{}, err
	}
	return state, nil
}

// loadAccount reads the account row with its lifetime totals.
func loadAccount(ctx context.Context, database querier, playerID int64) (PlayerState, error) {
	state := PlayerState{ID: playerID}
	var hiddenAt sql.NullInt64
	const selectAccountSQL = `SELECT name, color, hidden_at,
			(SELECT COUNT(*) FROM lan_entries WHERE player_id = players.id AND last_seen_at > 0),
			(SELECT COALESCE(SUM(xp), 0) FROM lan_entries WHERE player_id = players.id)
		FROM players WHERE id = ?`
	err := database.QueryRowContext(ctx, selectAccountSQL, playerID).
		Scan(&state.Name, &state.Color, &hiddenAt, &state.LANsAttended, &state.TotalXP)
	if errors.Is(err, sql.ErrNoRows) {
		return PlayerState{}, ErrUnauthorized
	}
	if err != nil {
		return PlayerState{}, fmt.Errorf("load player: %w", err)
	}
	state.Hidden = hiddenAt.Valid
	state.Equipped, err = loadEquipped(ctx, database, playerID)
	if err != nil {
		return PlayerState{}, err
	}
	return state, nil
}

// loadProgress adds the latest entry. After a LAN its last state stays visible.
func loadProgress(ctx context.Context, database querier, state *PlayerState, now int64) error {
	var row entryRow
	const selectLatestEntrySQL = `SELECT l.id, l.slug, l.name, l.starts_at, l.ends_at,
			l.rules, e.joined_at, e.xp, e.sign_key, e.follow_player_id,
			e.trip_x, e.trip_y, e.trip_until, e.follow_started_at
		FROM lan_entries e JOIN lans l ON l.id = e.lan_id
		WHERE e.player_id = ?
		ORDER BY (l.starts_at <= ? AND ? < l.ends_at) DESC, l.starts_at DESC LIMIT 1`
	err := database.QueryRowContext(ctx, selectLatestEntrySQL, state.ID, now, now).
		Scan(&row.lanID, &row.info.Slug, &row.info.Name, &row.startsAt, &row.endsAt,
			&row.rulesJSON, &row.joinedAt, &row.xp, &row.sign, &row.follow,
			&row.trip.x, &row.trip.y, &row.trip.until, &row.followStartedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load entry: %w", err)
	}
	row.info.Active = row.startsAt <= now && now < row.endsAt
	state.LAN = &row.info
	state.XP = row.xp
	state.Level = rules.CalculateLevel(row.xp)
	if !row.info.Active {
		return nil
	}
	if row.sign.Valid {
		state.Sign = &row.sign.String
	}
	state.Trip = row.trip.findRunningTrip(now)
	return loadActiveTimers(ctx, database, state, row, now)
}

// loadActiveTimers adds when the next poke and reports earn XP in a running LAN.
func loadActiveTimers(
	ctx context.Context, database querier, state *PlayerState, row entryRow, now int64,
) error {
	gameRules, err := parseRules(row.rulesJSON)
	if err != nil {
		return err
	}
	lastPokeAt, err := loadLastPokeTime(ctx, database, row.lanID, state.ID)
	if err != nil {
		return err
	}
	nextPokeAt := rules.CalculateNextPokeTime(gameRules, lastPokeAt, row.joinedAt)
	state.NextPokeAt = &nextPokeAt
	follow := findRunningFollow(gameRules, row.follow, row.followStartedAt, now)
	state.FollowPlayerID, state.FollowUntil = follow.playerID, follow.until
	history, err := loadReportHistory(ctx, database, row.lanID, state.ID)
	if err != nil {
		return err
	}
	status := rules.CalculateReportStatus(gameRules, history, now)
	state.Reports = &status
	return nil
}

// loadUnlockedCosmetics applies the cosmetic rules to the history of a player.
func loadUnlockedCosmetics(
	ctx context.Context, database querier, playerID int64,
) ([]string, error) {
	var currentXP, bestXP, currentEvents, totalEvents int
	const selectUnlockFactsSQL = `SELECT
		COALESCE((SELECT e.xp FROM lan_entries e JOIN lans l ON l.id = e.lan_id
			WHERE e.player_id = ?1 ORDER BY l.starts_at DESC LIMIT 1), 0),
		COALESCE((SELECT MAX(xp) FROM lan_entries WHERE player_id = ?1), 0),
		(SELECT COUNT(*) FROM xp_log WHERE player_id = ?1 AND action = ?2 AND lan_id = (
			SELECT e.lan_id FROM lan_entries e JOIN lans l ON l.id = e.lan_id
			WHERE e.player_id = ?1 ORDER BY l.starts_at DESC LIMIT 1)),
		(SELECT COUNT(*) FROM xp_log WHERE player_id = ?1 AND action = ?2)`
	err := database.QueryRowContext(ctx, selectUnlockFactsSQL,
		playerID, actionEvent).Scan(&currentXP, &bestXP, &currentEvents, &totalEvents)
	if err != nil {
		return nil, fmt.Errorf("load unlock facts: %w", err)
	}
	awards, err := loadPlayerAwards(ctx, database, playerID)
	if err != nil {
		return nil, err
	}
	awardCosmetics := []string{}
	for _, award := range awards {
		if award.CosmeticKey != nil {
			awardCosmetics = append(awardCosmetics, *award.CosmeticKey)
		}
	}
	return rules.ListUnlockedCosmetics(rules.UnlockFacts{
		CurrentLevel:   rules.CalculateLevel(currentXP),
		BestLevel:      rules.CalculateLevel(bestXP),
		CurrentEvents:  currentEvents,
		TotalEvents:    totalEvents,
		AwardCosmetics: awardCosmetics,
	}), nil
}

// loadBadges returns all attended LANs, newest first.
func loadBadges(ctx context.Context, database querier, playerID int64) ([]Badge, error) {
	const selectBadgesSQL = `SELECT l.slug, l.name
		FROM lan_entries e JOIN lans l ON l.id = e.lan_id
		WHERE e.player_id = ? AND e.last_seen_at > 0 ORDER BY l.starts_at DESC`
	rows, err := database.QueryContext(ctx, selectBadgesSQL, playerID)
	if err != nil {
		return nil, fmt.Errorf("load badges: %w", err)
	}
	defer func() { _ = rows.Close() }()
	badges := []Badge{}
	for rows.Next() {
		var badge Badge
		if err := rows.Scan(&badge.Slug, &badge.Name); err != nil {
			return nil, fmt.Errorf("read badge: %w", err)
		}
		badges = append(badges, badge)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load badges: %w", err)
	}
	return badges, nil
}

// loadAchievementHistory returns everything a player has earned across all LANs.
func loadAchievementHistory(
	ctx context.Context, database querier, playerID int64,
) ([]EarnedAchievement, error) {
	const selectAchievementHistorySQL = `SELECT a.key, l.slug, a.earned_at, a.best_value
		FROM achievements a LEFT JOIN lans l ON l.id = a.scope_lan_id
		WHERE a.player_id = ? ORDER BY a.earned_at, a.key`
	rows, err := database.QueryContext(ctx, selectAchievementHistorySQL, playerID)
	if err != nil {
		return nil, fmt.Errorf("load achievement history: %w", err)
	}
	defer func() { _ = rows.Close() }()
	history := []EarnedAchievement{}
	for rows.Next() {
		var earned EarnedAchievement
		var lanSlug sql.NullString
		if err := rows.Scan(&earned.Key, &lanSlug, &earned.EarnedAt, &earned.Best); err != nil {
			return nil, fmt.Errorf("read achievement: %w", err)
		}
		if lanSlug.Valid {
			earned.LANSlug = &lanSlug.String
		}
		if achievement, found := rules.FindAchievement(earned.Key); found {
			earned.Title = achievement.Title
			earned.RecordUnit = achievement.RecordUnit
		}
		history = append(history, earned)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load achievement history: %w", err)
	}
	return history, nil
}

// loadPlayerAwards returns all prizes of a player, oldest first.
func loadPlayerAwards(
	ctx context.Context, database querier, playerID int64,
) ([]PlayerAward, error) {
	const selectAwardsSQL = `SELECT title, cosmetic_key, given_at FROM awards
		WHERE player_id = ? ORDER BY given_at, id`
	rows, err := database.QueryContext(ctx, selectAwardsSQL, playerID)
	if err != nil {
		return nil, fmt.Errorf("load awards: %w", err)
	}
	defer func() { _ = rows.Close() }()
	awards := []PlayerAward{}
	for rows.Next() {
		var award PlayerAward
		var cosmetic sql.NullString
		if err := rows.Scan(&award.Title, &cosmetic, &award.GivenAt); err != nil {
			return nil, fmt.Errorf("read award: %w", err)
		}
		if cosmetic.Valid {
			award.CosmeticKey = &cosmetic.String
		}
		awards = append(awards, award)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load awards: %w", err)
	}
	return awards, nil
}

// PlayerProfile is what every account can read about another player.
type PlayerProfile struct {
	ID           int64                       `json:"id"`
	Name         string                      `json:"name"`
	Color        string                      `json:"color"`
	Equipped     map[string]EquippedCosmetic `json:"equipped"`
	XP           int                         `json:"xp"`
	Level        int                         `json:"level"`
	TotalXP      int                         `json:"total_xp"`
	LANsAttended int                         `json:"lans_attended"`
	Badges       []Badge                     `json:"badges"`
	Achievements []EarnedAchievement         `json:"achievements"`
	Awards       []PlayerAward               `json:"awards"`
}

// LoadPlayerProfile returns the profile of a player. A hidden player does not exist for others.
func (store *Store) LoadPlayerProfile(
	ctx context.Context, playerID, now int64,
) (PlayerProfile, error) {
	state, err := store.LoadPlayerState(ctx, playerID, now)
	if errors.Is(err, ErrUnauthorized) {
		return PlayerProfile{}, ErrPlayerNotFound
	}
	if err != nil {
		return PlayerProfile{}, err
	}
	if state.Hidden {
		return PlayerProfile{}, ErrPlayerNotFound
	}
	return PlayerProfile{
		ID: state.ID, Name: state.Name, Color: state.Color, Equipped: state.Equipped,
		XP: state.XP, Level: state.Level, TotalXP: state.TotalXP,
		LANsAttended: state.LANsAttended, Badges: state.Badges,
		Achievements: state.Achievements, Awards: state.Awards,
	}, nil
}

// PublicPlayer is one line of the player list.
type PublicPlayer struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
	Level int    `json:"level"`
}

// PlayerList is one page of the player list. Without a next cursor, it is the last one.
type PlayerList struct {
	Items      []PublicPlayer `json:"items"`
	NextCursor *string        `json:"next_cursor"`
}

// ListPublicPlayers returns visible players after a cursor, with the level of their latest LAN.
func (store *Store) ListPublicPlayers(
	ctx context.Context, afterID int64, limit int,
) (PlayerList, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	list := PlayerList{Items: []PublicPlayer{}, NextCursor: nil}
	const selectPublicPlayersSQL = `SELECT p.id, p.name, p.color, COALESCE((
			SELECT e.xp FROM lan_entries e WHERE e.player_id = p.id
			ORDER BY e.lan_id DESC LIMIT 1), 0)
		FROM players p WHERE p.id > ? AND p.hidden_at IS NULL ORDER BY p.id LIMIT ?`
	rows, err := store.readDB.QueryContext(queryCtx, selectPublicPlayersSQL, afterID, limit+1)
	if err != nil {
		return list, fmt.Errorf("list players: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var player PublicPlayer
		var lanXP int
		err = rows.Scan(&player.ID, &player.Name, &player.Color, &lanXP)
		if err != nil {
			return list, fmt.Errorf("read player: %w", err)
		}
		player.Level = rules.CalculateLevel(lanXP)
		list.Items = append(list.Items, player)
	}
	if err := rows.Err(); err != nil {
		return list, fmt.Errorf("list players: %w", err)
	}
	if len(list.Items) > limit {
		list.Items = list.Items[:limit]
		cursor := strconv.FormatInt(list.Items[limit-1].ID, 10)
		list.NextCursor = &cursor
	}
	return list, nil
}
