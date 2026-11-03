// Package rules contains the game rules as pure functions without IO.
//
// All times are Unix milliseconds.
package rules

import "errors"

const (
	// NoPokeYet marks that a player has not earned poke XP in this LAN.
	NoPokeYet int64 = 0

	xpPerLevel      = 100
	millisPerSecond = 1000

	defaultPokeIntervalSeconds   = 900
	defaultPokeXP                = 3
	defaultPokeMaxTicks          = 4
	defaultFoodXP                = 15
	defaultDrinkXP               = 10
	defaultReportCooldownSeconds = 1800
	defaultReportWindowSeconds   = 86400
	defaultReportsPerWindow      = 8
	defaultPresenceWindowSeconds = 5400
	defaultEmoteCooldownSeconds  = 3
	defaultPartnerCodeSeconds    = 120
	defaultPartnerXP             = 2
	defaultFullHousePercent      = 33
	defaultMaxPlayers            = 120
	maxPercent                   = 100
)

// ErrInvalidRules reports rules with a value that would break the game.
var ErrInvalidRules = errors.New("invalid rules")

// Rules are the game values of a LAN, stored as JSON in `lans.rules`.
type Rules struct {
	// PokeIntervalSeconds is the minimum time between two XP pokes.
	PokeIntervalSeconds int64 `json:"poke_interval"`
	// PokeXP is the XP per interval.
	PokeXP int `json:"poke_xp"`
	// PokeMaxTicks limits the intervals one poke collects. 1 means no catch-up.
	PokeMaxTicks int64 `json:"poke_max_ticks"`
	// FoodXP is the XP for a food report.
	FoodXP int `json:"food_xp"`
	// DrinkXP is the XP for a drink report.
	DrinkXP int `json:"drink_xp"`
	// ReportCooldownSeconds is the time between two reports of the same kind.
	ReportCooldownSeconds int64 `json:"report_cooldown"`
	// ReportWindowSeconds is the rolling window for ReportsPerWindow.
	ReportWindowSeconds int64 `json:"report_window"`
	// ReportsPerWindow limits food and drink reports together.
	ReportsPerWindow int `json:"reports_per_window"`
	// PresenceWindowSeconds is how long a jelly stays on the stage after its last action.
	PresenceWindowSeconds int64 `json:"presence_window"`
	// EmoteCooldownSeconds is the time between two emotes of one player.
	EmoteCooldownSeconds int64 `json:"emote_cooldown"`
	// PartnerCodeSeconds is how long a partner emote code can be entered.
	PartnerCodeSeconds int64 `json:"partner_code_seconds"`
	// PartnerXP is the XP both players get for a partner emote with someone new in this LAN.
	PartnerXP int `json:"partner_xp"`
	// FullHousePercent is the share of the LAN's players that must redeem one event code together.
	FullHousePercent int `json:"full_house_percent"`
	// MaxPlayers limits how many accounts can take part in a LAN.
	MaxPlayers int `json:"max_players"`
}

// DefaultRules returns the starting values of a new LAN.
func DefaultRules() Rules {
	return Rules{
		PokeIntervalSeconds:   defaultPokeIntervalSeconds,
		PokeXP:                defaultPokeXP,
		PokeMaxTicks:          defaultPokeMaxTicks,
		FoodXP:                defaultFoodXP,
		DrinkXP:               defaultDrinkXP,
		ReportCooldownSeconds: defaultReportCooldownSeconds,
		ReportWindowSeconds:   defaultReportWindowSeconds,
		ReportsPerWindow:      defaultReportsPerWindow,
		PresenceWindowSeconds: defaultPresenceWindowSeconds,
		EmoteCooldownSeconds:  defaultEmoteCooldownSeconds,
		PartnerCodeSeconds:    defaultPartnerCodeSeconds,
		PartnerXP:             defaultPartnerXP,
		FullHousePercent:      defaultFullHousePercent,
		MaxPlayers:            defaultMaxPlayers,
	}
}

// ValidateRules rejects values that would break the game, such as a zero interval.
func ValidateRules(gameRules Rules) error {
	for _, duration := range []int64{
		gameRules.PokeIntervalSeconds, gameRules.PokeMaxTicks, gameRules.ReportCooldownSeconds,
		gameRules.ReportWindowSeconds, gameRules.PresenceWindowSeconds,
		gameRules.PartnerCodeSeconds,
	} {
		if duration <= 0 {
			return ErrInvalidRules
		}
	}
	for _, amount := range []int{
		gameRules.PokeXP, gameRules.FoodXP, gameRules.DrinkXP, gameRules.ReportsPerWindow,
		gameRules.PartnerXP,
	} {
		if amount < 0 {
			return ErrInvalidRules
		}
	}
	if gameRules.EmoteCooldownSeconds < 0 {
		return ErrInvalidRules
	}
	if gameRules.FullHousePercent < 1 || gameRules.FullHousePercent > maxPercent {
		return ErrInvalidRules
	}
	if gameRules.MaxPlayers < 1 {
		return ErrInvalidRules
	}
	return nil
}

// CalculateLevel returns the level for the XP of a LAN, starting at 1.
func CalculateLevel(xp int) int {
	return xp/xpPerLevel + 1
}

// CalculatePokeXP returns the XP for a poke. A poke that comes too early earns 0.
func CalculatePokeXP(gameRules Rules, lastPokeAt, now int64) int {
	if lastPokeAt == NoPokeYet {
		return gameRules.PokeXP
	}
	elapsed := now - lastPokeAt
	interval := gameRules.PokeIntervalSeconds * millisPerSecond
	if interval <= 0 || elapsed < interval {
		return 0
	}
	ticks := min(elapsed/interval, max(gameRules.PokeMaxTicks, 1))
	return int(ticks) * gameRules.PokeXP
}

// CalculateNextPokeTime returns when a poke earns XP again.
func CalculateNextPokeTime(gameRules Rules, lastPokeAt, joinedAt int64) int64 {
	if lastPokeAt == NoPokeYet {
		return joinedAt
	}
	return lastPokeAt + gameRules.PokeIntervalSeconds*millisPerSecond
}

// IsPresent reports whether a jelly with this last activity belongs on the stage.
func IsPresent(gameRules Rules, lastSeenAt, now int64) bool {
	return now-lastSeenAt < gameRules.PresenceWindowSeconds*millisPerSecond
}

// IsEmoteAllowed reports whether a player may emote again. `lastEmoteAt` is 0 without an emote.
func IsEmoteAllowed(gameRules Rules, lastEmoteAt, now int64) bool {
	return lastEmoteAt == 0 || now-lastEmoteAt >= gameRules.EmoteCooldownSeconds*millisPerSecond
}

// IsFullHouse reports whether enough players of a LAN redeemed the same event code.
func IsFullHouse(gameRules Rules, redeemers, joinedPlayers int) bool {
	return joinedPlayers > 0 && redeemers*maxPercent >= gameRules.FullHousePercent*joinedPlayers
}
