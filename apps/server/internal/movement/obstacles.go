package movement

import "github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"

// How far the body of a jelly reaches from its center, seen from above.
const jellyRadius = 0.8

// listObstacles returns everything jellies walk around, which is what the map says blocks.
func listObstacles(areas []rules.Area, frame floorFrame) []floorRect {
	obstacles := []floorRect{}
	for _, area := range areas {
		if area.Blocks {
			obstacles = append(obstacles, frame.toFloorRect(area))
		}
	}
	return obstacles
}
