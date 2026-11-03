package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// noArea groups the jellies without an area. Area IDs start at 1.
const noArea int64 = 0

// StagePlayer is a jelly as the stage shows it. Its area is a number without a name.
type StagePlayer struct {
	ID             int64                       `json:"id"`
	Name           string                      `json:"name"`
	Color          string                      `json:"color"`
	Equipped       map[string]EquippedCosmetic `json:"equipped"`
	Level          int                         `json:"level"`
	Sign           *string                     `json:"sign"`
	FollowPlayerID *int64                      `json:"follow_player_id"`
	LastSeenAt     int64                       `json:"last_seen_at"`
	AreaID         *int64                      `json:"area_id"`
	Trip           *Trip                       `json:"trip"`
	// SnackUntil tells the movement planner when a snack run ends.
	SnackUntil int64 `json:"-"`
	rules.HomeSpot
}

// StageState is everything the stage needs to start, the response of `GET /state`. With
// `ServerTime`, all screens play the moves of the jellies at the same time.
type StageState struct {
	LastEventID int64         `json:"last_event_id"`
	ServerTime  int64         `json:"server_time"`
	Room        rules.Room    `json:"room"`
	Areas       []StageArea   `json:"areas"`
	Players     []StagePlayer `json:"players"`
	Stacks      []Stack       `json:"stacks"`
	// WalkSpeed tells the movement planner how fast jellies walk in this LAN.
	WalkSpeed float64 `json:"-"`
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
	state := StageState{
		LastEventID: latestID, ServerTime: now, Room: rules.DescribeRoom(),
		Areas: []StageArea{}, Players: []StagePlayer{}, Stacks: []Stack{},
	}
	lan, err := loadActiveLAN(queryCtx, store.readDB, now)
	if errors.Is(err, ErrNoActiveLAN) {
		return state, nil
	}
	if err != nil {
		return StageState{}, err
	}
	state.WalkSpeed = lan.gameRules.WalkSpeed
	state.Areas, err = loadAreas(queryCtx, store.readDB, lan.id)
	if err != nil {
		return StageState{}, err
	}
	state.Stacks, err = loadRunningStacks(queryCtx, store.readDB, lan.id, now)
	if err != nil {
		return StageState{}, err
	}
	players, err := loadStagePlayers(queryCtx, store.readDB, lan, now)
	if err != nil {
		return StageState{}, err
	}
	equipped, err := loadEquippedInLAN(queryCtx, store.readDB, lan.id)
	if err != nil {
		return StageState{}, err
	}
	for index := range players {
		players[index].Equipped = equipped[players[index].ID]
		if players[index].Equipped == nil {
			players[index].Equipped = map[string]EquippedCosmetic{}
		}
	}
	placeStagePlayers(players, state.Areas)
	state.Players = slices.DeleteFunc(players, func(player StagePlayer) bool {
		return !rules.IsPresent(lan.gameRules, player.LastSeenAt, now)
	})
	return state, nil
}

// placeStagePlayers gives every jelly its home spot. A jelly without an area chills in the lounge
// with the lowest ID, or uses the whole stage when there is no lounge. Places follow the player
// order and count absent jellies, so nobody moves when someone leaves.
func placeStagePlayers(players []StagePlayer, areas []StageArea) {
	areaByID := map[int64]rules.Area{}
	for _, area := range areas {
		areaByID[area.ID] = area.Area
	}
	loungeIndex := slices.IndexFunc(areas, func(area StageArea) bool {
		return area.Kind == rules.AreaKindLounge
	})
	takenPlaces := map[int64]int{}
	for index := range players {
		player := &players[index]
		if player.AreaID == nil && loungeIndex >= 0 {
			loungeID := areas[loungeIndex].ID
			player.AreaID = &loungeID
		}
		area := rules.WholeStage()
		areaKey := noArea
		if player.AreaID != nil {
			area = areaByID[*player.AreaID]
			areaKey = *player.AreaID
		}
		player.HomeSpot = rules.CalculateHomeSpot(area, takenPlaces[areaKey])
		takenPlaces[areaKey]++
	}
}

// loadStagePlayers reads all visible jellies of a LAN, whether currently present or not.
func loadStagePlayers(
	ctx context.Context, database querier, lan activeLAN, now int64,
) ([]StagePlayer, error) {
	const selectStagePlayersSQL = `SELECT p.id, p.name, p.color, e.xp,
			e.sign_key, e.follow_player_id, e.last_seen_at, e.area_id,
			e.trip_x, e.trip_y, e.trip_until,
			COALESCE((SELECT MAX(x.created_at) FROM xp_log x
				WHERE x.player_id = p.id AND x.lan_id = e.lan_id AND x.action IN (?, ?)), 0)
		FROM lan_entries e JOIN players p ON p.id = e.player_id
		WHERE e.lan_id = ? AND p.hidden_at IS NULL ORDER BY p.id`
	rows, err := database.QueryContext(ctx, selectStagePlayersSQL,
		rules.ActionFood, rules.ActionDrink, lan.id)
	if err != nil {
		return nil, fmt.Errorf("load stage players: %w", err)
	}
	defer func() { _ = rows.Close() }()
	players := []StagePlayer{}
	for rows.Next() {
		player, err := scanStagePlayer(rows, lan.gameRules, now)
		if err != nil {
			return nil, err
		}
		players = append(players, player)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load stage players: %w", err)
	}
	return players, nil
}

// scanStagePlayer reads one jelly row.
func scanStagePlayer(rows *sql.Rows, gameRules rules.Rules, now int64) (StagePlayer, error) {
	var player StagePlayer
	var lanXP int
	var lastSnackAt int64
	var trip tripColumns
	var sign sql.NullString
	var follow, area sql.NullInt64
	err := rows.Scan(&player.ID, &player.Name, &player.Color, &lanXP, &sign, &follow,
		&player.LastSeenAt, &area, &trip.x, &trip.y, &trip.until, &lastSnackAt)
	if err != nil {
		return StagePlayer{}, fmt.Errorf("read stage player: %w", err)
	}
	player.Level = rules.CalculateLevel(lanXP)
	player.SnackUntil = rules.CalculateSnackRunEnd(gameRules, lastSnackAt)
	player.Trip = trip.findRunningTrip(now)
	if sign.Valid {
		player.Sign = &sign.String
	}
	if follow.Valid {
		player.FollowPlayerID = &follow.Int64
	}
	if area.Valid {
		player.AreaID = &area.Int64
	}
	return player, nil
}
