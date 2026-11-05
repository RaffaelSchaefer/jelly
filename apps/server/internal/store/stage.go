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
	ID       int64                       `json:"id"`
	Name     string                      `json:"name"`
	Color    string                      `json:"color"`
	Equipped map[string]EquippedCosmetic `json:"equipped"`
	Level    int                         `json:"level"`
	Sign     *string                     `json:"sign"`
	Follow   *Follow                     `json:"follow"`
	AreaID   *int64                      `json:"area_id"`
	// IsVisitor marks a jelly without a place of its own, which wanders through the visitor zones.
	IsVisitor bool `json:"is_visitor"`
	// Trip and LastSeenAt tell the movement planner and the presence check what is going on.
	// Clients
	// see the same in the moves and in who is listed at all.
	Trip       *Trip `json:"-"`
	LastSeenAt int64 `json:"-"`
	// SnackUntil tells the movement planner when a snack run ends.
	SnackUntil int64 `json:"-"`
	// LastSpot tells the movement planner where the jelly stood before a restart, or nil.
	LastSpot *rules.StagePoint `json:"-"`
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
	Gathering   *Gathering    `json:"gathering"`
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
		Areas: []StageArea{}, Players: []StagePlayer{}, Stacks: []Stack{}, Gathering: nil,
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
	state.Gathering, err = loadRunningGathering(queryCtx, store.readDB, lan.id, now)
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

// JellySpot is where a jelly stands right now.
type JellySpot struct {
	PlayerID int64
	Point    rules.StagePoint
}

// SaveJellySpots remembers where the jellies of the running LAN stand. Without a running LAN there
// is nothing to remember.
func (store *Store) SaveJellySpots(ctx context.Context, spots []JellySpot, now int64) error {
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		lan, err := loadActiveLAN(ctx, transaction, now)
		if errors.Is(err, ErrNoActiveLAN) {
			return nil
		}
		if err != nil {
			return err
		}
		const updateSpotSQL = `UPDATE lan_entries SET spot_x = ?, spot_y = ?
			WHERE lan_id = ? AND player_id = ?`
		for _, spot := range spots {
			_, err = transaction.ExecContext(ctx, updateSpotSQL,
				spot.Point.X, spot.Point.Y, lan.id, spot.PlayerID)
			if err != nil {
				return fmt.Errorf("save jelly spot: %w", err)
			}
		}
		return nil
	})
}

// findVisitorArea returns the ID of the area visitors start in: the first visitor zone, else the
// first lounge. Without both it returns nil, and visitors use the whole stage.
func findVisitorArea(areas []StageArea) *int64 {
	for _, kind := range []string{rules.AreaKindVisitors, rules.AreaKindLounge} {
		index := slices.IndexFunc(areas, func(area StageArea) bool { return area.Kind == kind })
		if index >= 0 {
			return &areas[index].ID
		}
	}
	return nil
}

// placeStagePlayers gives every jelly its home spot. A jelly without an area is a visitor. Places
// follow the player order and count absent jellies, so nobody moves when someone leaves.
func placeStagePlayers(players []StagePlayer, areas []StageArea) {
	areaByID := map[int64]rules.Area{}
	for _, area := range areas {
		areaByID[area.ID] = area.Area
	}
	visitorArea := findVisitorArea(areas)
	takenPlaces := map[int64]int{}
	for index := range players {
		player := &players[index]
		if player.AreaID == nil {
			player.IsVisitor = true
			player.AreaID = visitorArea
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
			e.sign_key, e.follow_player_id, e.follow_started_at, e.last_seen_at, e.area_id,
			e.trip_x, e.trip_y, e.trip_until, e.spot_x, e.spot_y,
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
	var lastSnackAt, followStartedAt int64
	var trip tripColumns
	var spotX, spotY sql.NullFloat64
	var sign sql.NullString
	var follow, area sql.NullInt64
	err := rows.Scan(
		&player.ID,
		&player.Name,
		&player.Color,
		&lanXP,
		&sign,
		&follow,
		&followStartedAt,
		&player.LastSeenAt,
		&area,
		&trip.x,
		&trip.y,
		&trip.until,
		&spotX,
		&spotY,
		&lastSnackAt,
	)
	if err != nil {
		return StagePlayer{}, fmt.Errorf("read stage player: %w", err)
	}
	player.Level = rules.CalculateLevel(gameRules, lanXP)
	player.SnackUntil = rules.CalculateSnackRunEnd(gameRules, lastSnackAt)
	player.Trip = trip.findRunningTrip(now)
	if spotX.Valid && spotY.Valid {
		player.LastSpot = &rules.StagePoint{X: spotX.Float64, Y: spotY.Float64}
	}
	if sign.Valid {
		player.Sign = &sign.String
	}
	player.Follow = findRunningFollow(gameRules, follow, followStartedAt, now)
	if area.Valid {
		player.AreaID = &area.Int64
	}
	return player, nil
}
