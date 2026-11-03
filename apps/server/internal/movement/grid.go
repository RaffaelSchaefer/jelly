package movement

import "math"

const (
	half = 0.5
	// Small enough for the narrow gaps of a real room.
	cellSize = 0.25
	// Line of sight is checked at half a cell, so no blocked cell is skipped.
	sightStep = cellSize * half
	noCell    = -1
)

// grid is the walkable floor as small cells. A cell is blocked when a jelly standing there would
// touch an obstacle.
type grid struct {
	room    floorRect
	columns int
	rows    int
	blocked []bool
}

// newGrid builds the grid of a room. A cell is blocked when its center is closer than `clearance`.
func newGrid(room floorRect, obstacles []floorRect, clearance float64) *grid {
	columns := int(math.Ceil((room.MaxX - room.MinX) / cellSize))
	rows := int(math.Ceil((room.MaxZ - room.MinZ) / cellSize))
	floor := &grid{
		room: room, columns: columns, rows: rows, blocked: make([]bool, columns*rows),
	}
	for cell := range floor.blocked {
		center := floor.findCellCenter(cell)
		for _, obstacle := range obstacles {
			if measureRectDistance(center, obstacle) < clearance {
				floor.blocked[cell] = true
				break
			}
		}
	}
	return floor
}

// findCell returns the cell under a point. Points outside the room use the nearest edge cell.
func (floor *grid) findCell(point floorPoint) int {
	column := int(math.Floor((point.X - floor.room.MinX) / cellSize))
	row := int(math.Floor((point.Z - floor.room.MinZ) / cellSize))
	column = min(floor.columns-1, max(0, column))
	row = min(floor.rows-1, max(0, row))
	return row*floor.columns + column
}

// findCellCenter returns the middle of a cell.
func (floor *grid) findCellCenter(cell int) floorPoint {
	return floorPoint{
		X: floor.room.MinX + (float64(cell%floor.columns)+half)*cellSize,
		Z: floor.room.MinZ + (float64(cell/floor.columns)+half)*cellSize,
	}
}

// isWalkable says whether a jelly may stand at this point. Outside the room counts as blocked.
func (floor *grid) isWalkable(point floorPoint) bool {
	return isInsideRect(point, floor.room) && !floor.blocked[floor.findCell(point)]
}

// hasLineOfSight says whether a jelly can walk straight from one point to the other.
func (floor *grid) hasLineOfSight(from, goal floorPoint) bool {
	steps := max(1, int(math.Ceil(measureDistance(from, goal)/sightStep)))
	for step := 0; step <= steps; step++ {
		share := float64(step) / float64(steps)
		point := floorPoint{X: from.X + (goal.X-from.X)*share, Z: from.Z + (goal.Z-from.Z)*share}
		if floor.blocked[floor.findCell(point)] {
			return false
		}
	}
	return true
}

// cellSearch walks over the grid outward from one cell.
type cellSearch struct {
	floor    *grid
	cameFrom []int
	queue    []int
}

// newCellSearch starts a search at one cell.
func newCellSearch(floor *grid, start int) *cellSearch {
	cameFrom := make([]int, len(floor.blocked))
	for cell := range cameFrom {
		cameFrom[cell] = noCell
	}
	cameFrom[start] = start
	return &cellSearch{floor: floor, cameFrom: cameFrom, queue: []int{start}}
}

// run visits cells until `isDone` accepts one, and returns that cell or `noCell`.
func (search *cellSearch) run(canEnter, isDone func(cell int) bool) int {
	for head := 0; head < len(search.queue); head++ {
		cell := search.queue[head]
		if isDone(cell) {
			return cell
		}
		for _, neighbor := range search.floor.listNeighbors(cell) {
			if search.cameFrom[neighbor] == noCell && canEnter(neighbor) {
				search.cameFrom[neighbor] = cell
				search.queue = append(search.queue, neighbor)
			}
		}
	}
	return noCell
}

// listCellsTo returns the cells from the start of the search to `cell`, both included.
func (search *cellSearch) listCellsTo(cell int) []int {
	cells := []int{cell}
	for search.cameFrom[cell] != cell {
		cell = search.cameFrom[cell]
		cells = append(cells, cell)
	}
	for left, right := 0, len(cells)-1; left < right; left, right = left+1, right-1 {
		cells[left], cells[right] = cells[right], cells[left]
	}
	return cells
}

// listNeighbors returns the cells next to a cell, without leaving the grid.
func (floor *grid) listNeighbors(cell int) []int {
	steps := listNeighborSteps()
	neighbors := make([]int, 0, len(steps))
	column := cell % floor.columns
	row := cell / floor.columns
	for _, step := range steps {
		nextColumn := column + step[0]
		nextRow := row + step[1]
		if nextColumn >= 0 && nextColumn < floor.columns && nextRow >= 0 && nextRow < floor.rows {
			neighbors = append(neighbors, nextRow*floor.columns+nextColumn)
		}
	}
	return neighbors
}

// listNeighborSteps returns the moves to the right, left, down and up.
func listNeighborSteps() [4][2]int {
	return [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
}

// findNearestWalkable returns the point itself if a jelly may stand there, otherwise the nearest
// free cell center.
func (floor *grid) findNearestWalkable(point floorPoint) floorPoint {
	if floor.isWalkable(point) {
		return point
	}
	search := newCellSearch(floor, floor.findCell(point))
	cell := search.run(
		func(int) bool { return true },
		func(cell int) bool { return !floor.blocked[cell] },
	)
	if cell == noCell {
		return point
	}
	return floor.findCellCenter(cell)
}

// findPath returns the waypoints from `from` to `goal`, without `from`. If `goal` cannot be
// reached, the path ends at the reachable cell closest to it.
func (floor *grid) findPath(from, goal floorPoint) []floorPoint {
	start := floor.findNearestWalkable(from)
	path := floor.searchPath(start, goal)
	if start != from {
		// A jelly that stands too close to a desk first steps out to the nearest free spot.
		return append([]floorPoint{start}, path...)
	}
	return path
}

// searchPath finds the cells to the goal and pulls them straight.
func (floor *grid) searchPath(start, goal floorPoint) []floorPoint {
	if floor.hasLineOfSight(start, goal) {
		return []floorPoint{goal}
	}
	goalCell := floor.findCell(goal)
	closestCell := floor.findCell(start)
	closestDistance := math.Inf(1)
	search := newCellSearch(floor, closestCell)
	reached := search.run(
		func(cell int) bool { return !floor.blocked[cell] },
		func(cell int) bool {
			distance := measureDistance(floor.findCellCenter(cell), goal)
			if distance < closestDistance {
				closestDistance = distance
				closestCell = cell
			}
			return cell == goalCell
		},
	)
	end := goal
	if reached == noCell {
		reached = closestCell
		end = floor.findCellCenter(closestCell)
	}
	cells := search.listCellsTo(reached)
	waypoints := make([]floorPoint, 0, len(cells))
	for _, cell := range cells[1:max(1, len(cells)-1)] {
		waypoints = append(waypoints, floor.findCellCenter(cell))
	}
	return floor.smoothPath(start, append(waypoints, end))
}

// smoothPath drops every waypoint that can be skipped in a straight line.
func (floor *grid) smoothPath(start floorPoint, waypoints []floorPoint) []floorPoint {
	smooth := []floorPoint{}
	anchor := start
	for index := 0; index < len(waypoints); index++ {
		for index+1 < len(waypoints) && floor.hasLineOfSight(anchor, waypoints[index+1]) {
			index++
		}
		anchor = waypoints[index]
		smooth = append(smooth, anchor)
	}
	return smooth
}
