package movement

import "github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"

const (
	// How far the body of a jelly reaches from its center, seen from above.
	jellyRadius = 0.8

	// What stands on a stage, like `listStagePropRects` in `web/stage/zones.ts` draws it.
	screenWidth      = 4.2
	screenDepth      = 0.2
	screenInset      = 0.3
	screenLeftShare  = 0.3
	screenRightShare = 0.7
	speakerWidth     = 1.0
	speakerDepth     = 0.8
	speakerSideInset = 0.6
	speakerBackInset = 0.2
	pedestalSize     = 0.7
	pedestalInset    = 0.25
)

// listObstacles returns everything jellies walk around: desks, snack bar counters and the props
// on stages.
func listObstacles(areas []rules.Area) []floorRect {
	obstacles := []floorRect{}
	for _, area := range areas {
		rect := toFloorRect(area)
		switch area.Kind {
		case rules.AreaKindStage:
			obstacles = append(obstacles, listStageProps(rect)...)
		case rules.AreaKindDesk, rules.AreaKindSnackbar:
			obstacles = append(obstacles, rect)
		}
	}
	return obstacles
}

// listStageProps returns the two beamer screens, the speaker stacks and the trophy of a stage.
func listStageProps(stage floorRect) []floorRect {
	width := stage.MaxX - stage.MinX
	screenLeft := stage.MinX + screenLeftShare*width
	screenRight := stage.MinX + screenRightShare*width
	screenMinZ := stage.MinZ + screenInset
	speakerMinZ := stage.MinZ + speakerBackInset
	pedestalX := (stage.MinX + stage.MaxX) * half
	pedestalMinZ := stage.MinZ + pedestalInset
	return []floorRect{
		{
			MinX: screenLeft - screenWidth*half, MaxX: screenLeft + screenWidth*half,
			MinZ: screenMinZ, MaxZ: screenMinZ + screenDepth,
		},
		{
			MinX: screenRight - screenWidth*half, MaxX: screenRight + screenWidth*half,
			MinZ: screenMinZ, MaxZ: screenMinZ + screenDepth,
		},
		{
			MinX: stage.MinX + speakerSideInset, MaxX: stage.MinX + speakerSideInset + speakerWidth,
			MinZ: speakerMinZ, MaxZ: speakerMinZ + speakerDepth,
		},
		{
			MinX: stage.MaxX - speakerSideInset - speakerWidth, MaxX: stage.MaxX - speakerSideInset,
			MinZ: speakerMinZ, MaxZ: speakerMinZ + speakerDepth,
		},
		{
			MinX: pedestalX - pedestalSize*half, MaxX: pedestalX + pedestalSize*half,
			MinZ: pedestalMinZ, MaxZ: pedestalMinZ + pedestalSize,
		},
	}
}
