package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const (
	movementInterval = time.Second
	queryTopics      = "topics"
	topicEvents      = "events"
	topicMoves       = "moves"
	topicSeparator   = ","
)

// streamTopics says what a stream wants to receive.
type streamTopics struct {
	events bool
	moves  bool
}

// streamCursor is how far a stream has read.
type streamCursor struct {
	topics     streamTopics
	afterEvent int64
	afterMove  int64
}

// parseStreamTopics reads `?topics=`. Without it, a stream receives everything.
func parseStreamTopics(request *http.Request) (streamTopics, error) {
	list := request.URL.Query().Get(queryTopics)
	if list == "" {
		return streamTopics{events: true, moves: true}, nil
	}
	topics := streamTopics{events: false, moves: false}
	for topic := range strings.SplitSeq(list, topicSeparator) {
		switch topic {
		case topicEvents:
			topics.events = true
		case topicMoves:
			topics.moves = true
		default:
			return topics, store.ErrInvalidInput
		}
	}
	return topics, nil
}

// writeStreamUpdates writes what is new for a stream. A failed plan does not end the stream.
func (server *apiServer) writeStreamUpdates(
	ctx context.Context, writer io.Writer, cursor *streamCursor, tick int,
) error {
	server.advanceMovement(ctx)
	events := []store.Event{}
	if cursor.topics.events {
		var err error
		events, err = server.Store.ListEventsAfter(ctx, cursor.afterEvent)
		if err != nil {
			return fmt.Errorf("list events: %w", err)
		}
	}
	var err error
	cursor.afterEvent, err = writeStreamTick(writer, events, cursor.afterEvent, tick)
	if err != nil {
		return err
	}
	if !cursor.topics.moves {
		return nil
	}
	moves, afterMove := server.planner.ListMovesAfter(cursor.afterMove)
	cursor.afterMove = afterMove
	return writeStreamMoves(writer, moves)
}

// writeStreamMoves writes moves without an ID, because they are not part of the event log.
func writeStreamMoves(writer io.Writer, moves []movement.Move) error {
	for _, move := range moves {
		data, err := json.Marshal(move)
		if err != nil {
			return fmt.Errorf("encode move: %w", err)
		}
		_, err = fmt.Fprintf(writer, "event: move\ndata: %s\n\n", data)
		if err != nil {
			return fmt.Errorf("write move: %w", err)
		}
	}
	return nil
}

// RunMovement keeps the jellies moving while nobody looks at the stage, until `ctx` ends. Otherwise
// positions would stand still and all jellies would start walking at once for the next viewer.
func (service *Service) RunMovement(ctx context.Context) {
	ticker := time.NewTicker(movementInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			service.server.advanceMovement(ctx)
			service.server.playBots(ctx)
		}
	}
}

// advanceMovement brings the plans up to date. Everyone who reads the stage asks for this too, so
// their answer is current, and the planner lets only the first one through.
func (server *apiServer) advanceMovement(ctx context.Context) {
	now := server.currentMillis()
	if !server.planner.ClaimAdvance(now) {
		return
	}
	err := server.Store.FinishExpired(ctx, now)
	if err != nil && ctx.Err() == nil {
		server.Logger.WarnContext(ctx, "finish expired", "error", err)
	}
	server.refreshMovement(ctx, now)
}

// refreshMovement plans right now, for answers that need to know where the jellies are.
func (server *apiServer) refreshMovement(ctx context.Context, now int64) {
	state, err := server.Store.LoadStageState(ctx, now)
	if err != nil {
		if ctx.Err() == nil {
			server.Logger.WarnContext(ctx, "plan movement", "error", err)
		}
		return
	}
	server.planner.Advance(now, buildRoster(state))
	server.saveJellySpots(ctx, now)
}

// saveJellySpots remembers the positions now and then. A failure only costs some of the walking
// after a restart, so it does not stop anything.
func (server *apiServer) saveJellySpots(ctx context.Context, now int64) {
	spots := server.planner.ListSpotsToSave(now)
	if len(spots) == 0 {
		return
	}
	saved := make([]store.JellySpot, 0, len(spots))
	for _, spot := range spots {
		saved = append(saved, store.JellySpot{
			PlayerID: spot.PlayerID,
			Point:    rules.StagePoint{X: spot.Point.X, Y: spot.Point.Y},
		})
	}
	err := server.Store.SaveJellySpots(ctx, saved, now)
	if err != nil && ctx.Err() == nil {
		server.Logger.WarnContext(ctx, "save jelly spots", "error", err)
	}
}

// buildRoster translates the stage for the planner.
func buildRoster(state store.StageState) movement.Roster {
	roster := movement.Roster{
		WalkSpeed: state.WalkSpeed,
		Room:      state.Room,
		Areas:     make([]rules.Area, 0, len(state.Areas)),
		Players:   make([]movement.Player, 0, len(state.Players)),
		Gathering: buildGathering(state.Gathering),
	}
	areaByID := make(map[int64]rules.Area, len(state.Areas))
	for _, area := range state.Areas {
		roster.Areas = append(roster.Areas, area.Area)
		areaByID[area.ID] = area.Area
	}
	stackPlaces := listStackPlaces(state.Stacks)
	for _, player := range state.Players {
		area := rules.WholeStage()
		if player.AreaID != nil {
			area = areaByID[*player.AreaID]
		}
		planned := movement.Player{
			IsVisitor: player.IsVisitor,
			ID:        player.ID, Area: area, FollowID: 0, Trip: nil, Stack: nil, LastSpot: nil,
			Home:       movement.Point{X: player.X, Y: player.Y},
			SnackUntil: player.SnackUntil,
		}
		if player.Follow != nil {
			planned.FollowID = player.Follow.PlayerID
		}
		if player.Trip != nil {
			planned.Trip = &movement.Point{X: player.Trip.X, Y: player.Trip.Y}
		}
		if player.LastSpot != nil {
			planned.LastSpot = &movement.Point{X: player.LastSpot.X, Y: player.LastSpot.Y}
		}
		if place, ok := stackPlaces[player.ID]; ok {
			planned.Stack = &place
		}
		roster.Players = append(roster.Players, planned)
	}
	return roster
}

// buildGathering tells the planner about a running gathering.
func buildGathering(gathering *store.Gathering) *movement.Gathering {
	if gathering == nil {
		return nil
	}
	planned := movement.Gathering{Kind: gathering.Kind, WinnerID: 0}
	if gathering.WinnerID != nil {
		planned.WinnerID = *gathering.WinnerID
	}
	return &planned
}

// listStackPlaces returns where each jelly on a stack stands.
func listStackPlaces(stacks []store.Stack) map[int64]movement.StackPlace {
	places := map[int64]movement.StackPlace{}
	for _, stack := range stacks {
		for level, playerID := range stack.MemberIDs {
			places[playerID] = movement.StackPlace{
				Point: movement.Point{X: stack.X, Y: stack.Y}, Level: level,
			}
		}
	}
	return places
}
