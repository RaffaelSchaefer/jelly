package rules

import (
	"errors"
	"slices"
)

// The slots of a jelly. A jelly wears at most one cosmetic per slot.
const (
	SlotHead  = "head"
	SlotHands = "hands"
	SlotBody  = "body"
	SlotFace  = "face"
	SlotAura  = "aura"
)

var (
	// ErrUnknownSlot reports a slot outside the fixed list.
	ErrUnknownSlot = errors.New("unknown slot")
	// ErrUnknownCosmetic reports a cosmetic that is not in the catalog or belongs to another slot.
	ErrUnknownCosmetic = errors.New("unknown cosmetic")
	// ErrInvalidCosmeticColor reports a color outside the palette or for a fixed cosmetic.
	ErrInvalidCosmeticColor = errors.New("invalid cosmetic color")
)

// Scope says how long something earned stays. Changing one catalog value changes the behavior.
type Scope string

const (
	// ScopePermanent stays across all LANs.
	ScopePermanent Scope = "permanent"
	// ScopeLAN applies to the current LAN only.
	ScopeLAN Scope = "lan"
)

const (
	levelHeadset      = 2
	levelBeanie       = 3
	levelPixelGlasses = 5
	levelHood         = 6
	levelCrown        = 10
)

// Cosmetic is one item. It unlocks through a level or an event, or only through an award.
type Cosmetic struct {
	Key   string `json:"key"`
	Name  string `json:"name"`
	Scope Scope  `json:"scope"`
	Slot  string `json:"slot"`
	// Colorable cosmetics take a color from the palette, the others always look the same.
	Colorable     bool `json:"colorable"`
	Level         int  `json:"level,omitempty"`
	RequiresEvent bool `json:"requires_event,omitempty"`
}

// UnlockFacts are the facts about a player that decide their cosmetics.
type UnlockFacts struct {
	CurrentLevel   int
	BestLevel      int
	CurrentEvents  int
	TotalEvents    int
	AwardCosmetics []string
}

// ListCosmetics returns the catalog, matching `apps/client/src/pet/cosmetics.ts`.
func ListCosmetics() []Cosmetic {
	return []Cosmetic{
		{
			Key:   "headset",
			Name:  "Headset",
			Scope: ScopePermanent,
			Slot:  SlotHead,
			Level: levelHeadset,
		},
		{
			Key: "beanie", Name: "Mütze", Scope: ScopePermanent, Slot: SlotHead, Colorable: true,
			Level: levelBeanie,
		},
		{
			Key: "party-hat", Name: "Party-Hut", Scope: ScopePermanent, Slot: SlotHead,
			RequiresEvent: true,
		},
		{
			Key: "pixel-glasses", Name: "Pixel-Brille", Scope: ScopePermanent, Slot: SlotFace,
			Level: levelPixelGlasses,
		},
		{
			Key: "hood", Name: "Kapuze", Scope: ScopePermanent, Slot: SlotHead, Colorable: true,
			Level: levelHood,
		},
		{Key: "crown", Name: "Krone", Scope: ScopeLAN, Slot: SlotHead, Level: levelCrown},
		{Key: "golden-cup", Name: "Goldener Pokal", Scope: ScopePermanent, Slot: SlotHands},
	}
}

// ValidateAwardCosmetic accepts what the catalog knows, because only that can be worn.
func ValidateAwardCosmetic(key string) error {
	isKnown := slices.ContainsFunc(ListCosmetics(), func(cosmetic Cosmetic) bool {
		return cosmetic.Key == key
	})
	if !isKnown {
		return ErrUnknownCosmetic
	}
	return nil
}

// ListCosmeticSlots returns the slots of a jelly.
func ListCosmeticSlots() []CatalogEntry {
	return []CatalogEntry{
		{Key: SlotHead, Label: "Kopf"},
		{Key: SlotHands, Label: "Hände"},
		{Key: SlotBody, Label: "Körper"},
		{Key: SlotFace, Label: "Gesicht"},
		{Key: SlotAura, Label: "Aura"},
	}
}

// ListCosmeticColors returns the palette of colorable cosmetics as hex text. The API always speaks
// hex, so a free color choice later only drops this check.
func ListCosmeticColors() []string {
	return []string{
		"#ffffff", "#2b2d42", "#e5534b", "#ff9f43", "#ffd45c",
		"#4cd97b", "#4cc9f0", "#7a5cff", "#f59ac9",
	}
}

// ValidateEquip checks a change to one slot. An empty key takes off what is in the slot.
func ValidateEquip(slot, key string, color *string) error {
	if !containsKey(ListCosmeticSlots(), slot) {
		return ErrUnknownSlot
	}
	if key == "" {
		return nil
	}
	index := slices.IndexFunc(ListCosmetics(), func(cosmetic Cosmetic) bool {
		return cosmetic.Key == key && cosmetic.Slot == slot
	})
	if index < 0 {
		return ErrUnknownCosmetic
	}
	if color == nil {
		return nil
	}
	isAllowed := ListCosmetics()[index].Colorable && slices.Contains(ListCosmeticColors(), *color)
	if !isAllowed {
		return ErrInvalidCosmeticColor
	}
	return nil
}

// ListUnlockedCosmetics returns the keys a player may wear, in catalog order.
func ListUnlockedCosmetics(facts UnlockFacts) []string {
	unlocked := []string{}
	for _, cosmetic := range ListCosmetics() {
		if isCosmeticUnlocked(cosmetic, facts) {
			unlocked = append(unlocked, cosmetic.Key)
		}
	}
	for _, key := range facts.AwardCosmetics {
		if !slices.Contains(unlocked, key) {
			unlocked = append(unlocked, key)
		}
	}
	return unlocked
}

// isCosmeticUnlocked compares a cosmetic against the facts of its scope.
func isCosmeticUnlocked(cosmetic Cosmetic, facts UnlockFacts) bool {
	level, events := facts.BestLevel, facts.TotalEvents
	if cosmetic.Scope == ScopeLAN {
		level, events = facts.CurrentLevel, facts.CurrentEvents
	}
	if cosmetic.RequiresEvent {
		return events > 0
	}
	return cosmetic.Level > 0 && level >= cosmetic.Level
}
