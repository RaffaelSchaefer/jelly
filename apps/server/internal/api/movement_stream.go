package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/movement"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const (
	queryTopics    = "topics"
	topicEvents    = "events"
	topicMoves     = "moves"
	topicSeparator = ","
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

// advanceMovement brings the plans up to date. Everyone who looks at the stage does this, so
// nothing is planned while nobody is watching and no goroutine has to run.
func (server *apiServer) advanceMovement(ctx context.Context) {
	now := server.currentMillis()
	if !server.planner.ClaimAdvance(now) {
		return
	}
	server.refreshMovement(ctx, now)
}

// refreshMovement plans right now, for answers that need to know where the jellies are.
func (server *apiServer) refreshMovement(ctx context.Context, now int64) {
	state, err := server.Store.LoadStageState(ctx, now)
	if err != nil {
		server.Logger.WarnContext(ctx, "plan movement", "error", err)
		return
	}
	server.planner.Advance(now, buildRoster(state))
}

// buildRoster translates the stage for the planner.
func buildRoster(state store.StageState) movement.Roster {
	roster := movement.Roster{
		WalkSpeed: state.WalkSpeed,
		Areas:     make([]rules.Area, 0, len(state.Areas)),
		Players:   make([]movement.Player, 0, len(state.Players)),
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
			ID: player.ID, Area: area, FollowID: 0, Trip: nil, Stack: nil,
			Home:       movement.Point{X: player.X, Y: player.Y},
			SnackUntil: player.SnackUntil,
		}
		if player.FollowPlayerID != nil {
			planned.FollowID = *player.FollowPlayerID
		}
		if player.Trip != nil {
			planned.Trip = &movement.Point{X: player.Trip.X, Y: player.Trip.Y}
		}
		if place, ok := stackPlaces[player.ID]; ok {
			planned.Stack = &place
		}
		roster.Players = append(roster.Players, planned)
	}
	return roster
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
