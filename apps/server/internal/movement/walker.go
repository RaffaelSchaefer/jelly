package movement

import (
	"math"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const (
	// Goals keep half a body from the edges of an area.
	edgeMargin = jellyRadius / 2
	// Closest distance between two goals. A jelly is about 1.7 wide.
	personalSpace   = 1.8
	millisPerSecond = 1000
	// A wandering jelly picks a spot this far around its place, or further in a large area.
	wanderReach     = 1.0
	wanderAreaShare = 0.1
	wanderTries     = 6
	shortestWander  = 0.6
	shortestPause   = 8000
	longestPause    = 25000
	replanDistance  = 0.75
	spotCandidates  = 64
	spotSpacing     = personalSpace * half
	goldenAngle     = 2.399963
	fullShare       = 1.0
	snackGap        = 1.1
	// A jelly from the far end of the hall still waits this long at the counter.
	snackWaitMillis  = 5000
	snackSpreadShare = 0.8
	sidesPerJelly    = 2
)

// routePoint is a point of a route with its absolute time.
type routePoint struct {
	floorPoint

	at int64
}

// walkPlan says what a jelly is doing. A new plan always starts a new walk.
type walkPlan struct {
	kind     string
	trip     Point
	followID int64
	stack    StackPlace
}

// walker is the state of one jelly.
type walker struct {
	playerID int64
	home     Point
	area     rules.Area
	bounds   floorRect
	// anchor is its own spot near home, free of other jellies.
	anchor       floorPoint
	isPlaced     bool
	plan         walkPlan
	route        []routePoint
	move         Move
	nextWanderAt int64
	// followedEnd is where the followed jelly was heading when this jelly last planned.
	followedEnd floorPoint
}

// setRoute takes over a route and builds the move for the screens.
func (walker *walker) setRoute(kind string, startAt int64, route []routePoint) {
	points := make([]Waypoint, 0, len(route))
	for _, point := range route {
		points = append(points, Waypoint{Point: toPoint(point.floorPoint), T: point.at - startAt})
	}
	walker.route = route
	walker.move = Move{
		PlayerID: walker.playerID, Kind: kind, StartAt: startAt, Points: points,
		Level: walker.plan.stack.Level,
	}
}

// findPositionAt returns the position on the route at a time.
func (walker *walker) findPositionAt(now int64) floorPoint {
	last := walker.route[0]
	if now <= last.at {
		return last.floorPoint
	}
	for _, next := range walker.route[1:] {
		if now < next.at {
			share := float64(now-last.at) / float64(next.at-last.at)
			return floorPoint{
				X: last.X + (next.X-last.X)*share,
				Z: last.Z + (next.Z-last.Z)*share,
			}
		}
		last = next
	}
	return last.floorPoint
}

// findDestination returns where the route ends.
func (walker *walker) findDestination() floorPoint {
	return walker.route[len(walker.route)-1].floorPoint
}

// findArrival returns when the route ends.
func (walker *walker) findArrival() int64 {
	return walker.route[len(walker.route)-1].at
}

// updateWalker starts a new walk when the plan of a jelly changed or the current one asks for it.
func (planner *Planner) updateWalker(now int64, player Player) {
	walker := planner.walkers[player.ID]
	wanted := planner.findPlan(now, player)
	if wanted != walker.plan {
		walker.plan = wanted
		planner.startPlan(now, walker)
		return
	}
	switch wanted.kind {
	case KindWander:
		planner.keepWandering(now, walker)
	case KindFollow:
		planner.keepFollowing(now, walker)
	}
}

// findPlan returns what a jelly should do now. A stack comes first, then a snack, then the trip,
// then the jelly it follows. A followed jelly that left the stage ends the following.
func (planner *Planner) findPlan(now int64, player Player) walkPlan {
	if player.Stack != nil {
		return walkPlan{kind: KindStack, stack: *player.Stack}
	}
	walker := planner.walkers[player.ID]
	isAtSnack := walker.plan.kind == KindSnack && now < walker.findArrival()+snackWaitMillis
	if planner.snackBar != nil && (player.SnackUntil > now || isAtSnack) {
		return walkPlan{kind: KindSnack}
	}
	if player.Trip != nil {
		return walkPlan{kind: KindTrip, trip: *player.Trip}
	}
	if _, ok := planner.walkers[player.FollowID]; ok && player.FollowID != player.ID {
		return walkPlan{kind: KindFollow, followID: player.FollowID}
	}
	return walkPlan{kind: KindWander}
}

// startPlan sends a jelly on its way after its plan changed.
func (planner *Planner) startPlan(now int64, walker *walker) {
	room := listRoomRect()
	var goal floorPoint
	switch walker.plan.kind {
	case KindSnack:
		goal = planner.findFreeSpot(walker, planner.findSnackSpot(), room)
	case KindTrip:
		goal = planner.findFreeSpot(walker, toFloorPoint(walker.plan.trip), room)
	case KindFollow:
		goal = planner.findFollowGoal(walker)
	case KindStack:
		goal = planner.floor.findNearestWalkable(toFloorPoint(walker.plan.stack.Point))
	default:
		goal = planner.findFreeSpot(walker, walker.anchor, walker.bounds)
		walker.nextWanderAt = now + planner.drawPause()
	}
	planner.startWalk(now, walker, goal)
	if walker.plan.kind == KindWander {
		walker.nextWanderAt += walker.findArrival() - now
	}
}

// startWalk plans the way to a goal and publishes it. The jelly goes on walking its old route
// until the new one starts, so it does not jump on any screen.
func (planner *Planner) startWalk(now int64, walker *walker, goal floorPoint) {
	startAt := now + moveLeadMillis
	from := walker.findPositionAt(startAt)
	path := planner.floor.findPath(from, goal)
	walker.setRoute(walker.plan.kind, startAt, buildRoute(from, path, startAt, planner.walkSpeed))
	planner.publish(walker.move)
}

// buildRoute adds the times to a path.
func buildRoute(from floorPoint, path []floorPoint, startAt int64, speed float64) []routePoint {
	route := []routePoint{{floorPoint: from, at: startAt}}
	walked := 0.0
	last := from
	for _, waypoint := range path {
		walked += measureDistance(last, waypoint)
		last = waypoint
		at := startAt + int64(math.Round(walked/speed*millisPerSecond))
		route = append(route, routePoint{floorPoint: waypoint, at: at})
	}
	return route
}

// keepWandering picks a new spot once the jelly has stood around for a while.
func (planner *Planner) keepWandering(now int64, walker *walker) {
	if now < walker.nextWanderAt || now < walker.findArrival() {
		return
	}
	walker.nextWanderAt = now + planner.drawPause()
	for range wanderTries {
		goal := planner.floor.findNearestWalkable(planner.drawWanderSpot(walker))
		isFarEnough := measureDistance(walker.findDestination(), goal) >= shortestWander
		if isFarEnough && planner.isFreeSpot(walker, goal) {
			planner.startWalk(now, walker, goal)
			walker.nextWanderAt += walker.findArrival() - now
			return
		}
	}
}

// drawWanderSpot returns a random spot around the place of a jelly, inside its area.
func (planner *Planner) drawWanderSpot(walker *walker) floorPoint {
	reachX := max(wanderReach, (walker.bounds.MaxX-walker.bounds.MinX)*wanderAreaShare)
	reachZ := max(wanderReach, (walker.bounds.MaxZ-walker.bounds.MinZ)*wanderAreaShare)
	spot := floorPoint{
		X: walker.anchor.X + reachX*(planner.random.Float64()+planner.random.Float64()-fullShare),
		Z: walker.anchor.Z + reachZ*(planner.random.Float64()+planner.random.Float64()-fullShare),
	}
	return clampIntoRect(spot, walker.bounds)
}

// keepFollowing plans a new way when the followed jelly is heading somewhere else.
func (planner *Planner) keepFollowing(now int64, walker *walker) {
	target := planner.walkers[walker.plan.followID]
	if measureDistance(target.findDestination(), walker.followedEnd) > replanDistance {
		planner.startWalk(now, walker, planner.findFollowGoal(walker))
	}
}

// findFollowGoal returns a free spot beside the followed jelly. The ID decides the side.
func (planner *Planner) findFollowGoal(walker *walker) floorPoint {
	walker.followedEnd = planner.walkers[walker.plan.followID].findDestination()
	side := personalSpace
	if walker.playerID%sidesPerJelly == 0 {
		side = -personalSpace
	}
	beside := floorPoint{X: walker.followedEnd.X + side, Z: walker.followedEnd.Z}
	return planner.findFreeSpot(walker, beside, listRoomRect())
}

// findSnackSpot returns a random place behind the counter, seen from the camera.
func (planner *Planner) findSnackSpot() floorPoint {
	bar := planner.snackBar
	share := (fullShare-snackSpreadShare)*half + snackSpreadShare*planner.random.Float64()
	return floorPoint{X: bar.MinX + share*(bar.MaxX-bar.MinX), Z: bar.MinZ - snackGap}
}

// drawPause returns how long a jelly stands before it wanders on.
func (planner *Planner) drawPause() int64 {
	return shortestPause + planner.random.Int64N(longestPause-shortestPause)
}

// findFreeSpot returns the spot closest to `wanted` where no other jelly is heading. It prefers
// `bounds`, a full area spills over into the rest of the room. Without any free spot, the jelly
// shares the nearest one.
func (planner *Planner) findFreeSpot(
	walker *walker,
	wanted floorPoint,
	bounds floorRect,
) floorPoint {
	room := listRoomRect()
	for _, limit := range []floorRect{bounds, room} {
		for index := range spotCandidates {
			distance := spotSpacing * math.Sqrt(float64(index))
			angle := float64(index) * goldenAngle
			spot := floorPoint{
				X: wanted.X + distance*math.Cos(angle),
				Z: wanted.Z + distance*math.Sin(angle),
			}
			if isInsideRect(spot, limit) && planner.floor.isWalkable(spot) &&
				planner.isFreeSpot(walker, spot) {
				return spot
			}
		}
	}
	return planner.floor.findNearestWalkable(clampIntoRect(wanted, room))
}

// isFreeSpot says whether no other jelly stands or is heading too close to a spot.
func (planner *Planner) isFreeSpot(walker *walker, spot floorPoint) bool {
	for playerID, other := range planner.walkers {
		if playerID == walker.playerID || other.route == nil {
			continue
		}
		if measureDistance(other.findDestination(), spot) < personalSpace {
			return false
		}
	}
	return true
}
