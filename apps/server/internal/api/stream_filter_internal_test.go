package api

import (
	"encoding/json"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// listOwnEventCases says for every documented event how an app without its map gets it: "global"
// for everyone, "player" when it is the player of the event, or the payload field naming it.
// "message" is not in the event log: `reset` reaches every stream, `move` follows the topic
// `moves`.
func listOwnEventCases() map[string]string {
	return map[string]string{
		"player.active":         "player",
		"player.updated":        "player",
		"player.hidden":         "player",
		"player.removed":        "player_id",
		"xp.gained":             "player",
		"level.up":              "player",
		"achievement.earned":    "player",
		"award.given":           "player",
		"coins.gained":          "player",
		"cosmetic.purchased":    "player",
		"emote":                 "player",
		"partner.emote":         "partner_id",
		"partner_emote.updated": "from_id",
		"sign.changed":          "player",
		"follow.changed":        "player",
		"trip.changed":          "player",
		"stack.changed":         "player",
		"highlight":             "player",
		"stage.changed":         "global",
		"gathering.changed":     "global",
		"rules.changed":         "global",
		"move":                  "message",
		"reset":                 "message",
	}
}

func TestEveryDocumentedEventHasAnOwnRule(t *testing.T) {
	var docs contractDocs
	err := json.Unmarshal(contractDocsFile, &docs)
	if err != nil {
		t.Fatal(err)
	}
	const ownID, otherID = int64(7), int64(8)
	cases := listOwnEventCases()
	for _, doc := range docs.Events {
		rule, known := cases[doc.Type]
		if !known {
			t.Errorf("%s: decide whether an app without its map needs it", doc.Type)
			continue
		}
		if rule == "message" {
			continue
		}
		other := store.Event{
			ID:       1,
			Type:     doc.Type,
			PlayerID: new(otherID),
			Payload:  json.RawMessage(`{}`),
		}
		mine := other
		switch rule {
		case "global":
		case "player":
			mine.PlayerID = new(ownID)
		default:
			mine.Payload = json.RawMessage(`{"` + rule + `":7}`)
		}
		if !mine.ConcernsPlayer(ownID) {
			t.Errorf("%s: an app without its map misses its own event", doc.Type)
		}
		if rule != "global" && other.ConcernsPlayer(ownID) {
			t.Errorf("%s: an app without its map gets the event of someone else", doc.Type)
		}
	}
}
