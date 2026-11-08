package rules

import "errors"

var (
	// ErrUnknownEmote reports an emote outside the fixed list.
	ErrUnknownEmote = errors.New("unknown emote")
	// ErrUnknownSign reports a sign outside the fixed list.
	ErrUnknownSign = errors.New("unknown sign")
	// ErrUnknownPartnerEmote reports a partner emote outside the fixed list.
	ErrUnknownPartnerEmote = errors.New("unknown partner emote")
)

// CatalogEntry is one choice of a fixed list. `Label` is shown in the German app.
type CatalogEntry struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// ListEmotes returns the fixed emote list.
func ListEmotes() []CatalogEntry {
	return []CatalogEntry{
		{Key: "wave", Label: "Winken"},
		{Key: "dance", Label: "Tanzen"},
		{Key: "cheer", Label: "Jubeln"},
		{Key: "laugh", Label: "Lachen"},
		{Key: "sleep", Label: "Schlafen"},
		{Key: "love", Label: "Herz"},
		{Key: "shrug", Label: "Schulterzucken"},
		{Key: "point", Label: "Zeigen"},
		{Key: "think", Label: "Grübeln"},
	}
}

// ListPartnerEmotes returns what two jellies can do together. These are motions only, so the stage
// needs no animation art for them.
func ListPartnerEmotes() []CatalogEntry {
	return []CatalogEntry{
		{Key: "hop", Label: "Zusammen hüpfen"},
		{Key: "spin", Label: "Zusammen drehen"},
		{Key: "wiggle", Label: "Zusammen wackeln"},
	}
}

// ListSigns returns the fixed list of search signs.
func ListSigns() []CatalogEntry {
	return []CatalogEntry{
		{Key: "any", Label: "Suche Mitspieler"},
		{Key: "cs2", Label: "Suche CS2"},
		{Key: "lol", Label: "Suche LoL"},
		{Key: "rocket-league", Label: "Suche Rocket League"},
		{Key: "mario-kart", Label: "Suche Mario Kart"},
		{Key: "minecraft", Label: "Suche Minecraft"},
		{Key: "board-game", Label: "Suche Brettspiel"},
		{Key: "food", Label: "Wer holt mit Essen?"},
	}
}

// ValidateEmote checks an emote key against the fixed list.
func ValidateEmote(key string) error {
	if containsKey(ListEmotes(), key) {
		return nil
	}
	return ErrUnknownEmote
}

// ValidatePartnerEmote checks a partner emote key against the fixed list.
func ValidatePartnerEmote(key string) error {
	if containsKey(ListPartnerEmotes(), key) {
		return nil
	}
	return ErrUnknownPartnerEmote
}

// ValidateSign checks a sign key against the fixed list.
func ValidateSign(key string) error {
	if containsKey(ListSigns(), key) {
		return nil
	}
	return ErrUnknownSign
}

// containsKey reports whether a list has an entry with this key.
func containsKey(entries []CatalogEntry, key string) bool {
	for _, entry := range entries {
		if entry.Key == key {
			return true
		}
	}
	return false
}
