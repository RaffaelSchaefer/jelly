package movement

import (
	"cmp"
	"math"
	"slices"

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
	// Enough to reach across the hall, so a whole LAN that gathers gets spots of its own.
	spotCandidates = 400
	spotSpacing    = personalSpace * half
	placeSpacing   = personalSpace * 1.01
	goldenAngle    = 2.399963
	fullShare      = 1.0
	// A jelly from the far end of the hall still waits this long in the queue.
	snackWaitMillis = 5000
	sidesPerJelly   = 2
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
	isVisitor    bool
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
		StackLevel: walker.plan.stack.Level,
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

// findPlan returns what a jelly should do now. A gathering comes first, then a stack, a snack, the
// trip and the jelly it follows. A followed jelly that left the stage ends the following.
func (planner *Planner) findPlan(now int64, player Player) walkPlan {
	if planner.gathering != nil && len(planner.findGatherZones(player.ID)) > 0 {
		return walkPlan{kind: planner.gathering.Kind}
	}
	if player.Stack != nil {
		return walkPlan{kind: KindStack, stack: *player.Stack}
	}
	walker := planner.walkers[player.ID]
	isAtSnack := walker.plan.kind == KindSnack && now < walker.findArrival()+snackWaitMillis
	if len(planner.zones[rules.AreaKindQueue]) > 0 && (player.SnackUntil > now || isAtSnack) {
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
		goal = planner.findGatherSpot(now, walker, planner.zones[rules.AreaKindQueue])
	case KindFood, KindCeremony:
		goal = planner.findGatherSpot(now, walker, planner.findGatherZones(walker.playerID))
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

// drawVisitorSpot returns a random spot in a random visitor zone. Without any, the jelly wanders
// through all of its own area.
func (planner *Planner) drawVisitorSpot(walker *walker) floorPoint {
	zone := walker.bounds
	if visitorZones := planner.zones[rules.AreaKindVisitors]; len(visitorZones) > 0 {
		zone = visitorZones[planner.random.IntN(len(visitorZones))]
	}
	return fromRectFrame(floorPoint{
		X: zone.MinX + (zone.MaxX-zone.MinX)*planner.random.Float64(),
		Z: zone.MinZ + (zone.MaxZ-zone.MinZ)*planner.random.Float64(),
	}, zone)
}

// drawWanderSpot returns a random spot around the place of a jelly, inside its area.
func (planner *Planner) drawWanderSpot(walker *walker) floorPoint {
	if walker.isVisitor {
		return planner.drawVisitorSpot(walker)
	}
	reachX := max(wanderReach, (walker.bounds.MaxX-walker.bounds.MinX)*wanderAreaShare)
	reachZ := max(wanderReach, (walker.bounds.MaxZ-walker.bounds.MinZ)*wanderAreaShare)
	offset := walker.bounds.Turn.Apply(rules.FloorOffset{
		X: reachX * (planner.random.Float64() + planner.random.Float64() - fullShare),
		Z: reachZ * (planner.random.Float64() + planner.random.Float64() - fullShare),
	})
	spot := floorPoint{X: walker.anchor.X + offset.X, Z: walker.anchor.Z + offset.Z}
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

// findGatherZones returns where a jelly goes during the running gathering. At a ceremony, the
// winner goes to the winner zone if there is one.
func (planner *Planner) findGatherZones(playerID int64) []floorRect {
	if planner.gathering.Kind == KindFood {
		return planner.zones[rules.AreaKindQueue]
	}
	winnerZones := planner.zones[rules.AreaKindWinner]
	if playerID == planner.gathering.WinnerID && len(winnerZones) > 0 {
		return winnerZones
	}
	return planner.zones[rules.AreaKindSpectators]
}

// findGatherSpot returns the free place closest to the jelly in the closest zone with room. If all
// of them are full, it stands as close as it can to the closest zone.
func (planner *Planner) findGatherSpot(
	now int64, walker *walker, wantedZones []floorRect,
) floorPoint {
	position := walker.findPositionAt(now)
	zones := slices.Clone(wantedZones)
	slices.SortStableFunc(zones, func(first, second floorRect) int {
		return cmp.Compare(
			measureRectDistance(position, first),
			measureRectDistance(position, second),
		)
	})
	for _, zone := range zones {
		spot, found := planner.findZonePlace(walker, position, zone)
		if found {
			return spot
		}
	}
	return planner.findFreeSpot(walker, findRectCenter(zones[0]), listRoomRect())
}

// findZonePlace looks at the places of a zone, which fill all of its area without gaps. It returns
// the free one closest to the position.
func (planner *Planner) findZonePlace(
	walker *walker, position floorPoint, zone floorRect,
) (floorPoint, bool) {
	closest, found := floorPoint{X: 0, Z: 0}, false
	for _, place := range listZonePlaces(zone) {
		isCloser := !found || measureDistance(position, place) < measureDistance(position, closest)
		if isCloser && planner.floor.isWalkable(place) && planner.isFreeSpot(walker, place) {
			closest, found = place, true
		}
	}
	return closest, found
}

// listZonePlaces returns the places of a zone in rows, one body apart and centered.
func listZonePlaces(zone floorRect) []floorPoint {
	columns := countPlacesAlong(zone.MaxX - zone.MinX)
	rows := countPlacesAlong(zone.MaxZ - zone.MinZ)
	places := make([]floorPoint, 0, columns*rows)
	for row := range rows {
		for column := range columns {
			places = append(places, fromRectFrame(floorPoint{
				X: zone.MinX + (zone.MaxX-zone.MinX)*(float64(column)+half)/float64(columns),
				Z: zone.MinZ + (zone.MaxZ-zone.MinZ)*(float64(row)+half)/float64(rows),
			}, zone))
		}
	}
	return places
}

// countPlacesAlong returns how many jellies fit next to each other on a length, at least one. Rows
// keep a little more than the personal space, so all of their places count as free.
func countPlacesAlong(length float64) int {
	return max(1, int(length/placeSpacing))
}

// findRectCenter returns the middle of a rectangle.
func findRectCenter(rect floorRect) floorPoint {
	return floorPoint{X: (rect.MinX + rect.MaxX) * half, Z: (rect.MinZ + rect.MaxZ) * half}
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
