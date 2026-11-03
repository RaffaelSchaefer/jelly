package movement

import (
	"math/rand/v2"
	"slices"
	"sync"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// Why a jelly walks. New kinds can appear, clients treat all of them the same.
const (
	KindWander = "wander"
	KindTrip   = "trip"
	KindFollow = "follow"
	KindSnack  = "snack"
	KindStack  = "stack"
)

const (
	// A move starts in the future, so it reaches every screen before the jelly has to walk.
	moveLeadMillis = 1000
	// Jellies get new plans at this rate, however many streams ask for them.
	advanceIntervalMillis = 1000
	// Old moves are kept this long for streams that fell behind, about ten minutes on a full LAN.
	journalLimit = 5000
	seedStream   = 1
)

// Waypoint is a point of a move. `T` counts milliseconds from the start of the move.
type Waypoint struct {
	Point

	T int64 `json:"t"`
}

// Move is one walk of a jelly. Every screen plays it the same way, a newer move of the same jelly
// replaces it. After its last waypoint the jelly stands there.
type Move struct {
	PlayerID int64      `json:"player_id"`
	Kind     string     `json:"kind"`
	StartAt  int64      `json:"start_at"`
	Points   []Waypoint `json:"points"`
	// Level counts the jellies below this one, once it has arrived on a stack.
	Level int `json:"level"`
}

// Player is what the planner has to know about a jelly on the stage.
type Player struct {
	ID       int64
	Area     rules.Area
	Home     Point
	FollowID int64
	// Trip is the point of a running trip, or nil.
	Trip *Point
	// SnackUntil is when a snack run ends. It is in the past without a snack run.
	SnackUntil int64
	// Stack is the place on a stack, or nil.
	Stack *StackPlace
}

// StackPlace is where a jelly stands on a stack.
type StackPlace struct {
	Point Point
	Level int
}

// Roster is everyone on the stage and the room they stand in, in the order of their IDs.
type Roster struct {
	// WalkSpeed is how fast jellies walk, in jelly units per second.
	WalkSpeed float64
	Areas     []rules.Area
	Players   []Player
}

// Planner decides where the jellies walk. It lives as long as the server and all methods can be
// called at the same time. Positions are not stored: After a restart, everyone stands at home.
type Planner struct {
	mutex       sync.Mutex
	random      *rand.Rand
	lastAdvance int64
	walkSpeed   float64
	areas       []rules.Area
	floor       *grid
	snackBar    *floorRect
	walkers     map[int64]*walker
	// journal holds the newest moves. The move at index i has the number firstNumber + i.
	journal     []Move
	firstNumber int64
}

// NewPlanner creates a planner for an empty room.
func NewPlanner() *Planner {
	return &Planner{
		//nolint:gosec // Where a jelly wanders needs no secure randomness.
		random:      rand.New(rand.NewPCG(seedStream, seedStream)),
		floor:       newGrid(listRoomRect(), nil, jellyRadius),
		walkers:     map[int64]*walker{},
		firstNumber: 1,
	}
}

// ClaimAdvance says whether new plans are due and if so, reserves them for the caller.
func (planner *Planner) ClaimAdvance(now int64) bool {
	planner.mutex.Lock()
	defer planner.mutex.Unlock()
	if now-planner.lastAdvance < advanceIntervalMillis {
		return false
	}
	planner.lastAdvance = now
	return true
}

// Advance brings the plans up to the given time.
func (planner *Planner) Advance(now int64, roster Roster) {
	planner.mutex.Lock()
	defer planner.mutex.Unlock()
	planner.walkSpeed = roster.WalkSpeed
	planner.syncRoom(roster.Areas)
	planner.syncWalkers(now, roster.Players)
	for _, player := range roster.Players {
		planner.updateWalker(now, player)
	}
}

// ListCurrentMoves returns the latest move of every jelly, in the order of their IDs.
func (planner *Planner) ListCurrentMoves() []Move {
	planner.mutex.Lock()
	defer planner.mutex.Unlock()
	return planner.collectCurrentMoves()
}

// ListMovesAfter returns the moves after a number and the number to ask with next time. Number 0,
// or one that is too old, returns the latest move of every jelly.
func (planner *Planner) ListMovesAfter(number int64) ([]Move, int64) {
	planner.mutex.Lock()
	defer planner.mutex.Unlock()
	latest := planner.firstNumber + int64(len(planner.journal)) - 1
	if number <= 0 || number < planner.firstNumber-1 {
		return planner.collectCurrentMoves(), latest
	}
	if number >= latest {
		return nil, latest
	}
	return slices.Clone(planner.journal[number-planner.firstNumber+1:]), latest
}

// FindPosition returns where a jelly is at this time.
func (planner *Planner) FindPosition(playerID, now int64) (Point, bool) {
	planner.mutex.Lock()
	defer planner.mutex.Unlock()
	walker, ok := planner.walkers[playerID]
	if !ok {
		return Point{}, false
	}
	return toPoint(walker.findPositionAt(now)), true
}

// MeasureDistance returns the distance of two jellies in jelly units.
func (planner *Planner) MeasureDistance(firstID, secondID, now int64) (float64, bool) {
	planner.mutex.Lock()
	defer planner.mutex.Unlock()
	first, isFirstKnown := planner.walkers[firstID]
	second, isSecondKnown := planner.walkers[secondID]
	if !isFirstKnown || !isSecondKnown {
		return 0, false
	}
	return measureDistance(first.findPositionAt(now), second.findPositionAt(now)), true
}

// MeasureDistanceTo returns the distance of a jelly to a point in jelly units.
func (planner *Planner) MeasureDistanceTo(playerID int64, point Point, now int64) (float64, bool) {
	planner.mutex.Lock()
	defer planner.mutex.Unlock()
	walker, ok := planner.walkers[playerID]
	if !ok {
		return 0, false
	}
	return measureDistance(walker.findPositionAt(now), toFloorPoint(point)), true
}

// collectCurrentMoves reads the latest moves for callers that hold the lock.
func (planner *Planner) collectCurrentMoves() []Move {
	moves := make([]Move, 0, len(planner.walkers))
	for _, walker := range planner.walkers {
		moves = append(moves, walker.move)
	}
	slices.SortFunc(moves, func(first, second Move) int {
		return int(first.PlayerID - second.PlayerID)
	})
	return moves
}

// syncRoom builds the walkable floor again when the areas changed.
func (planner *Planner) syncRoom(areas []rules.Area) {
	if slices.Equal(planner.areas, areas) {
		return
	}
	planner.areas = slices.Clone(areas)
	planner.floor = newGrid(listRoomRect(), listObstacles(areas), jellyRadius)
	planner.snackBar = nil
	for _, area := range areas {
		if area.Kind == rules.AreaKindSnackbar {
			bar := toFloorRect(area)
			planner.snackBar = &bar
			break
		}
	}
	for _, walker := range planner.walkers {
		walker.isPlaced = false
	}
}

// syncWalkers removes jellies that left, adds new ones and finds places for those that moved.
func (planner *Planner) syncWalkers(now int64, players []Player) {
	present := make(map[int64]bool, len(players))
	for _, player := range players {
		present[player.ID] = true
	}
	for playerID := range planner.walkers {
		if !present[playerID] {
			delete(planner.walkers, playerID)
		}
	}
	for _, player := range players {
		walker, ok := planner.walkers[player.ID]
		if !ok {
			planner.addWalker(now, player)
			continue
		}
		if !walker.isPlaced || walker.home != player.Home || walker.area != player.Area {
			planner.placeWalker(walker, player)
			walker.plan = walkPlan{}
		}
	}
}

// addWalker lets a new jelly appear at its place, or at the point of its running trip.
func (planner *Planner) addWalker(now int64, player Player) {
	walker := &walker{playerID: player.ID}
	planner.walkers[player.ID] = walker
	planner.placeWalker(walker, player)
	spot := walker.anchor
	if player.Trip != nil {
		spot = planner.findFreeSpot(walker, toFloorPoint(*player.Trip), listRoomRect())
		walker.plan = walkPlan{kind: KindTrip, trip: *player.Trip}
	} else {
		walker.plan = walkPlan{kind: KindWander}
	}
	walker.setRoute(walker.plan.kind, now, []routePoint{{floorPoint: spot, at: now}})
	walker.nextWanderAt = now + planner.drawPause()
	planner.publish(walker.move)
}

// placeWalker finds the spot a jelly belongs to, near its home.
func (planner *Planner) placeWalker(walker *walker, player Player) {
	walker.home = player.Home
	walker.area = player.Area
	walker.bounds = shrinkRect(toFloorRect(player.Area), edgeMargin)
	walker.anchor = planner.findFreeSpot(walker, toFloorPoint(player.Home), walker.bounds)
	walker.isPlaced = true
}

// publish notes a new move for the streams.
func (planner *Planner) publish(move Move) {
	planner.journal = append(planner.journal, move)
	if len(planner.journal) > journalLimit {
		dropped := len(planner.journal) - journalLimit
		planner.journal = slices.Delete(planner.journal, 0, dropped)
		planner.firstNumber += int64(dropped)
	}
}
