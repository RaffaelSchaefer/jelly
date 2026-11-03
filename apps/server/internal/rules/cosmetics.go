package rules

import "slices"

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
	Key           string `json:"key"`
	Name          string `json:"name"`
	Scope         Scope  `json:"scope"`
	Level         int    `json:"level,omitempty"`
	RequiresEvent bool   `json:"requires_event,omitempty"`
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
		{Key: "headset", Name: "Headset", Scope: ScopePermanent, Level: levelHeadset},
		{Key: "beanie", Name: "Mütze", Scope: ScopePermanent, Level: levelBeanie},
		{Key: "party-hat", Name: "Party-Hut", Scope: ScopePermanent, RequiresEvent: true},
		{
			Key: "pixel-glasses", Name: "Pixel-Brille", Scope: ScopePermanent,
			Level: levelPixelGlasses,
		},
		{Key: "hood", Name: "Kapuze", Scope: ScopePermanent, Level: levelHood},
		{Key: "crown", Name: "Krone", Scope: ScopeLAN, Level: levelCrown},
	}
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
