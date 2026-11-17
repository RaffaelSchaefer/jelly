package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// scopePublic is the scope of all events. The column allows private events later.
const scopePublic = "public"

// Event types the stream delivers.
const (
	EventPlayerActive      = "player.active"
	EventPlayerUpdated     = "player.updated"
	EventPlayerHidden      = "player.hidden"
	EventPlayerRemoved     = "player.removed"
	EventXPGained          = "xp.gained"
	EventLevelUp           = "level.up"
	EventCoinsGained       = "coins.gained"
	EventCosmeticPurchased = "cosmetic.purchased"
	EventAchievement       = "achievement.earned"
	EventAwardGiven        = "award.given"
	EventEmote             = "emote"
	EventSignChanged       = "sign.changed"
	EventFollowChanged     = "follow.changed"
	EventTripChanged       = "trip.changed"
	EventStackChanged      = "stack.changed"
	EventHighlight         = "highlight"
	EventStageChanged      = "stage.changed"
	EventGatheringChanged  = "gathering.changed"
	EventRulesChanged      = "rules.changed"
	EventPartnerEmote      = "partner.emote"
	EventPartnerInvite     = "partner_emote.updated"
	maxEventsPerQueryRows  = 200
)

// Event is one entry of the stream. The payload holds IDs and keys, never names.
type Event struct {
	ID        int64           `json:"id"`
	Type      string          `json:"type"`
	PlayerID  *int64          `json:"player_id"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt int64           `json:"created_at"`
}

// eventRecord is a new entry of the event log.
type eventRecord struct {
	lanID     int64
	eventType string
	scope     string
	playerID  int64
	payload   any
	now       int64
}

// payloadEdited marks a `player.updated` that the player caused, which counts for achievements.
const payloadEdited = "edited"

// LoadLatestEventID returns the newest event ID, or 0 for an empty log.
func (store *Store) LoadLatestEventID(ctx context.Context) (int64, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	return loadLatestEventID(queryCtx, store.readDB)
}

// ListEventsAfter returns the public events after `afterID`, oldest first.
func (store *Store) ListEventsAfter(ctx context.Context, afterID int64) ([]Event, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	const selectEventsAfterSQL = `SELECT
		id, type, player_id, payload, created_at
		FROM event_log WHERE id > ? AND scope = ? ORDER BY id LIMIT ?`
	rows, err := store.readDB.QueryContext(queryCtx, selectEventsAfterSQL,
		afterID, scopePublic, maxEventsPerQueryRows)
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}
	defer func() { _ = rows.Close() }()
	events := []Event{}
	for rows.Next() {
		event, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}
	return events, nil
}

// scanEvent reads one event row.
func scanEvent(rows *sql.Rows) (Event, error) {
	var event Event
	var playerID sql.NullInt64
	var payload string
	err := rows.Scan(&event.ID, &event.Type, &playerID, &payload, &event.CreatedAt)
	if err != nil {
		return Event{}, fmt.Errorf("read event: %w", err)
	}
	if playerID.Valid {
		event.PlayerID = &playerID.Int64
	}
	event.Payload = json.RawMessage(payload)
	return event, nil
}

// loadLatestEventID reads the newest event ID.
func loadLatestEventID(ctx context.Context, database querier) (int64, error) {
	var latestID int64
	const selectLatestEventIDSQL = `SELECT COALESCE(MAX(id), 0) FROM event_log`
	err := database.QueryRowContext(ctx, selectLatestEventIDSQL).
		Scan(&latestID)
	if err != nil {
		return 0, fmt.Errorf("load latest event: %w", err)
	}
	return latestID, nil
}

// appendEvent writes an event. A `playerID` of 0 stores no player.
func appendEvent(ctx context.Context, transaction *sql.Tx, record eventRecord) error {
	payload, err := json.Marshal(record.payload)
	if err != nil {
		return fmt.Errorf("encode event: %w", err)
	}
	var playerID sql.NullInt64
	if record.playerID != 0 {
		playerID = sql.NullInt64{Int64: record.playerID, Valid: true}
	}
	const insertEventSQL = `INSERT INTO event_log
		(lan_id, type, scope, player_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)`
	_, err = transaction.ExecContext(ctx, insertEventSQL,
		record.lanID, record.eventType, record.scope, playerID, string(payload), record.now)
	if err != nil {
		return fmt.Errorf("write event: %w", err)
	}
	return nil
}
