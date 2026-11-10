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

// CosmeticHighlightAura is what a jelly shows for a moment while it is highlighted. Nobody unlocks
// it.
const CosmeticHighlightAura = "highlight-aura"

// Scope says how long something earned stays. Changing one catalog value changes the behavior.
type Scope string

const (
	// ScopePermanent stays across all LANs.
	ScopePermanent Scope = "permanent"
	// ScopeLAN applies to the current LAN only.
	ScopeLAN Scope = "lan"
)

const (
	priceHeadset      = 1
	priceBeanie       = 2
	pricePixelGlasses = 3
	priceHood         = 4
	priceCrown        = 6
)

// Cosmetic is one item. It unlocks through a purchase, an event, or only through an award.
type Cosmetic struct {
	Key   string `json:"key"`
	Name  string `json:"name"`
	Scope Scope  `json:"scope"`
	Slot  string `json:"slot"`
	// Colorable cosmetics take a color from the palette, the others always look the same.
	Colorable bool `json:"colorable"`
	// Unlock says how a player gets it. Price is only set when that is in the shop.
	Unlock string `json:"unlock"`
	Price  int    `json:"price,omitempty"`
}

// How a player gets a cosmetic. Awards come from an admin, who can give away any cosmetic.
const (
	UnlockShop  = "shop"
	UnlockEvent = "event"
	UnlockAward = "award"
	UnlockNone  = "none"
)

var (
	// ErrNotForSale reports a cosmetic that the shop does not sell.
	ErrNotForSale = errors.New("cosmetic is not for sale")
	// ErrAlreadyOwned reports a cosmetic that this player already bought.
	ErrAlreadyOwned = errors.New("cosmetic is already owned")
	// ErrNotEnoughCoins reports a purchase whose price is above the coin balance.
	ErrNotEnoughCoins = errors.New("not enough coins")
)

// UnlockFacts are the facts about a player that decide their cosmetics.
type UnlockFacts struct {
	CurrentEvents  int
	TotalEvents    int
	AwardCosmetics []string
	// PurchasedCosmetics holds the shop cosmetics the player owns, already filtered by scope.
	PurchasedCosmetics []string
}

// ListCosmetics returns the catalog, matching `apps/client/src/pet/cosmetics.ts`.
func ListCosmetics() []Cosmetic {
	return []Cosmetic{
		{
			Key:    "headset",
			Name:   "Headset",
			Scope:  ScopePermanent,
			Slot:   SlotHead,
			Unlock: UnlockShop,
			Price:  priceHeadset,
		},
		{
			Key:    "headset-neutral",
			Name:   "Headset schlicht",
			Scope:  ScopePermanent,
			Slot:   SlotHead,
			Unlock: UnlockShop,
			Price:  priceHeadset,
		},
		{
			Key: "beanie", Name: "Mütze", Scope: ScopePermanent, Slot: SlotHead, Colorable: true,
			Unlock: UnlockShop, Price: priceBeanie,
		},
		{
			Key: "party-hat", Name: "Party-Hut", Scope: ScopePermanent, Slot: SlotHead,
			Unlock: UnlockEvent,
		},
		{
			Key: "pixel-glasses", Name: "Pixel-Brille", Scope: ScopePermanent, Slot: SlotFace,
			Unlock: UnlockShop, Price: pricePixelGlasses,
		},
		{
			Key: "hood", Name: "Kapuze", Scope: ScopePermanent, Slot: SlotHead, Colorable: true,
			Unlock: UnlockShop, Price: priceHood,
		},
		{
			Key: "crown", Name: "Krone", Scope: ScopeLAN, Slot: SlotHead,
			Unlock: UnlockShop, Price: priceCrown,
		},
		{
			Key: "golden-cup", Name: "Goldener Pokal", Scope: ScopePermanent, Slot: SlotHands,
			Unlock: UnlockAward,
		},
		{
			Key: "glow-aura", Name: "Glüh-Aura", Scope: ScopePermanent, Slot: SlotAura,
			Unlock: UnlockAward,
		},
		// Highlighting shows it for a moment. An admin can still give it away as a prize for fun.
		{
			Key: CosmeticHighlightAura, Name: "Leuchtaura", Scope: ScopePermanent, Slot: SlotAura,
			Unlock: UnlockNone,
		},
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

// FindCosmetic returns the catalog entry for a key.
func FindCosmetic(key string) (Cosmetic, bool) {
	index := slices.IndexFunc(ListCosmetics(), func(cosmetic Cosmetic) bool {
		return cosmetic.Key == key
	})
	if index < 0 {
		return Cosmetic{}, false
	}
	return ListCosmetics()[index], true
}

// CheckPurchase decides whether a player with `coins` may buy this cosmetic now. A player that
// already owns it, whether bought or given as an award, buys it a second time never.
func CheckPurchase(cosmetic Cosmetic, coins int, isOwned bool) error {
	switch {
	case cosmetic.Unlock != UnlockShop:
		return ErrNotForSale
	case isOwned:
		return ErrAlreadyOwned
	case coins < cosmetic.Price:
		return ErrNotEnoughCoins
	default:
		return nil
	}
}

// ListPermanentShopCosmetics returns the keys of the shop cosmetics that stay over LANs, in
// catalog order. The shop achievement counts them.
func ListPermanentShopCosmetics() []string {
	keys := []string{}
	for _, cosmetic := range ListCosmetics() {
		if cosmetic.Unlock == UnlockShop && cosmetic.Scope == ScopePermanent {
			keys = append(keys, cosmetic.Key)
		}
	}
	return keys
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

// isCosmeticUnlocked compares a cosmetic against the facts of its scope. Purchased cosmetics
// arrive in `facts` already filtered by scope.
func isCosmeticUnlocked(cosmetic Cosmetic, facts UnlockFacts) bool {
	events := facts.TotalEvents
	if cosmetic.Scope == ScopeLAN {
		events = facts.CurrentEvents
	}
	switch cosmetic.Unlock {
	case UnlockEvent:
		return events > 0
	case UnlockShop:
		return slices.Contains(facts.PurchasedCosmetics, cosmetic.Key)
	default:
		return false
	}
}
