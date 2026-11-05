// Package rules contains the game rules as pure functions without IO.
//
// All times are Unix milliseconds.
package rules

import (
	"errors"
	"slices"
)

const (
	// FirstLevel is the level of a player without XP.
	FirstLevel = 1
	// NoPokeYet marks that a player has not earned poke XP in this LAN.
	NoPokeYet int64 = 0
	// NoStackLimit lets stacks grow as high as the players can build them.
	NoStackLimit = 0

	defaultXPPerLevel = 100
	millisPerSecond   = 1000

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
	defaultPartnerInviteSeconds  = 120
	defaultPartnerXP             = 2
	defaultFullHousePercent      = 33
	defaultMaxPlayers            = 120
	defaultMaxStreams            = 200
	defaultMaxPlayerStreams      = 3
	defaultSnackRunSeconds       = 14
	defaultTripSeconds           = 300
	defaultFollowSeconds         = 1800
	defaultNearDistance          = 6.0
	defaultWalkSpeed             = 1.4
	defaultStackSeconds          = 120
	defaultHighlightSeconds      = 10
	defaultHighlightCooldown     = 30
	maxPercent                   = 100
)

// ErrInvalidRules reports rules with a value that would break the game.
var ErrInvalidRules = errors.New("invalid rules")

// Rules are the game values of a LAN, stored as JSON in `lans.rules`.
type Rules struct {
	PublicRules

	// MaxPlayers limits how many accounts can take part in a LAN.
	MaxPlayers int `json:"max_players"`
	// MaxStreams limits the open event streams of all players together.
	MaxStreams int `json:"max_streams"`
	// MaxPlayerStreams limits the open event streams of one player.
	MaxPlayerStreams int `json:"max_player_streams"`
}

// PublicRules are the rules that clients read, so they show the same as the server decides. The
// server still checks every action itself.
type PublicRules struct {
	// XPPerLevel is how much XP a level takes, the same for every level.
	XPPerLevel int `json:"xp_per_level"`
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
	// PartnerInviteSeconds is how long a partner emote invite can be answered.
	PartnerInviteSeconds int64 `json:"partner_invite_seconds"`
	// PartnerXP is the XP both players get for a partner emote with someone new in this LAN.
	PartnerXP int `json:"partner_xp"`
	// FullHousePercent is the share of the LAN's players that must redeem one event code together.
	FullHousePercent int `json:"full_house_percent"`
	// SnackRunSeconds is how long a jelly stays at the snack bar after a food or drink report.
	SnackRunSeconds int64 `json:"snack_run_seconds"`
	// TripSeconds is how long a jelly stays at the point of a trip before it walks back.
	TripSeconds int64 `json:"trip_seconds"`
	// FollowSeconds is how long a jelly follows another one before it walks back.
	FollowSeconds int64 `json:"follow_seconds"`
	// NearDistance is how far apart two jellies count as next to each other, in jelly units. A
	// jelly is about 1.7 wide, the hall 21 wide and 40 deep.
	NearDistance float64 `json:"near_distance"`
	// WalkSpeed is how fast jellies walk in jelly units per second, so a walk takes its length
	// divided by this.
	WalkSpeed float64 `json:"walk_speed"`
	// StackSeconds is how long a stack stands before it falls apart.
	StackSeconds int64 `json:"stack_seconds"`
	// StackMaxMembers limits how many jellies fit on one stack. 0 means no limit.
	StackMaxMembers int `json:"stack_max_members"`
	// HighlightSeconds is how long a highlighted jelly lights up.
	HighlightSeconds int64 `json:"highlight_seconds"`
	// HighlightCooldownSeconds is the time between two highlights of one player.
	HighlightCooldownSeconds int64 `json:"highlight_cooldown"`
}

// DefaultRules returns the starting values of a new LAN.
func DefaultRules() Rules {
	return Rules{
		XPPerLevel:               defaultXPPerLevel,
		PokeIntervalSeconds:      defaultPokeIntervalSeconds,
		PokeXP:                   defaultPokeXP,
		PokeMaxTicks:             defaultPokeMaxTicks,
		FoodXP:                   defaultFoodXP,
		DrinkXP:                  defaultDrinkXP,
		ReportCooldownSeconds:    defaultReportCooldownSeconds,
		ReportWindowSeconds:      defaultReportWindowSeconds,
		ReportsPerWindow:         defaultReportsPerWindow,
		PresenceWindowSeconds:    defaultPresenceWindowSeconds,
		EmoteCooldownSeconds:     defaultEmoteCooldownSeconds,
		PartnerInviteSeconds:     defaultPartnerInviteSeconds,
		PartnerXP:                defaultPartnerXP,
		FullHousePercent:         defaultFullHousePercent,
		SnackRunSeconds:          defaultSnackRunSeconds,
		TripSeconds:              defaultTripSeconds,
		FollowSeconds:            defaultFollowSeconds,
		NearDistance:             defaultNearDistance,
		WalkSpeed:                defaultWalkSpeed,
		StackSeconds:             defaultStackSeconds,
		StackMaxMembers:          NoStackLimit,
		HighlightSeconds:         defaultHighlightSeconds,
		HighlightCooldownSeconds: defaultHighlightCooldown,
		MaxPlayers:               defaultMaxPlayers,
		MaxStreams:               defaultMaxStreams,
		MaxPlayerStreams:         defaultMaxPlayerStreams,
	}
}

// ValidateRules rejects values that would break the game, such as a zero interval.
func ValidateRules(gameRules Rules) error {
	isValid := areDurationsValid(gameRules) && areAmountsValid(gameRules) &&
		areLimitsValid(gameRules) && gameRules.StackMaxMembers >= NoStackLimit &&
		gameRules.NearDistance > 0 && gameRules.WalkSpeed > 0 &&
		gameRules.FullHousePercent >= 1 && gameRules.FullHousePercent <= maxPercent
	if !isValid {
		return ErrInvalidRules
	}
	return nil
}

// areDurationsValid checks all times: most must pass, but a cooldown can be switched off.
func areDurationsValid(gameRules Rules) bool {
	durations := []int64{
		gameRules.PokeIntervalSeconds, gameRules.PokeMaxTicks, gameRules.ReportCooldownSeconds,
		gameRules.ReportWindowSeconds, gameRules.PresenceWindowSeconds,
		gameRules.PartnerInviteSeconds, gameRules.SnackRunSeconds, gameRules.TripSeconds,
		gameRules.StackSeconds, gameRules.HighlightSeconds, gameRules.FollowSeconds,
	}
	cooldowns := []int64{
		gameRules.EmoteCooldownSeconds, gameRules.HighlightCooldownSeconds,
	}
	return !slices.ContainsFunc(durations, func(value int64) bool { return value <= 0 }) &&
		!slices.ContainsFunc(cooldowns, func(value int64) bool { return value < 0 })
}

// areAmountsValid checks all XP values, where 0 is allowed.
func areAmountsValid(gameRules Rules) bool {
	return !slices.ContainsFunc([]int{
		gameRules.PokeXP, gameRules.FoodXP, gameRules.DrinkXP, gameRules.ReportsPerWindow,
		gameRules.PartnerXP,
	}, func(value int) bool { return value < 0 })
}

// areLimitsValid checks all limits, which need room for at least one.
func areLimitsValid(gameRules Rules) bool {
	return !slices.ContainsFunc([]int{
		gameRules.MaxPlayers,
		gameRules.MaxStreams,
		gameRules.MaxPlayerStreams,
		gameRules.XPPerLevel,
	}, func(value int) bool { return value < 1 })
}

// CalculateLevel returns the level for the XP of a LAN, starting at [FirstLevel].
func CalculateLevel(gameRules Rules, xp int) int {
	return xp/gameRules.XPPerLevel + FirstLevel
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

// CalculateSnackRunEnd returns when a snack run after this report ends. Without a report, it lies
// in the past.
func CalculateSnackRunEnd(gameRules Rules, lastSnackAt int64) int64 {
	if lastSnackAt == 0 {
		return 0
	}
	return lastSnackAt + gameRules.SnackRunSeconds*millisPerSecond
}

// CalculateTripEnd returns when a trip started now ends.
func CalculateTripEnd(gameRules Rules, now int64) int64 {
	return now + gameRules.TripSeconds*millisPerSecond
}

// CalculateFollowEnd returns when a jelly that started to follow at this time walks back.
func CalculateFollowEnd(gameRules Rules, startedAt int64) int64 {
	return startedAt + gameRules.FollowSeconds*millisPerSecond
}

// CalculateFollowCutoff returns the time after which a started follow is still running.
func CalculateFollowCutoff(gameRules Rules, now int64) int64 {
	return now - gameRules.FollowSeconds*millisPerSecond
}

// CalculateStackEnd returns when a stack started now falls apart.
func CalculateStackEnd(gameRules Rules, now int64) int64 {
	return now + gameRules.StackSeconds*millisPerSecond
}

// IsStackFull reports whether a stack with this many jellies takes no more.
func IsStackFull(gameRules Rules, members int) bool {
	return gameRules.StackMaxMembers != NoStackLimit && members >= gameRules.StackMaxMembers
}

// CalculateHighlightEnd returns when a highlight started now goes out.
func CalculateHighlightEnd(gameRules Rules, now int64) int64 {
	return now + gameRules.HighlightSeconds*millisPerSecond
}

// IsHighlightAllowed reports whether a player may highlight again. `lastAt` is 0 without one.
func IsHighlightAllowed(gameRules Rules, lastAt, now int64) bool {
	return lastAt == 0 || now-lastAt >= gameRules.HighlightCooldownSeconds*millisPerSecond
}

// IsEmoteAllowed reports whether a player may emote again. `lastEmoteAt` is 0 without an emote.
func IsEmoteAllowed(gameRules Rules, lastEmoteAt, now int64) bool {
	return lastEmoteAt == 0 || now-lastEmoteAt >= gameRules.EmoteCooldownSeconds*millisPerSecond
}

// IsFullHouse reports whether enough players of a LAN redeemed the same event code.
func IsFullHouse(gameRules Rules, redeemers, joinedPlayers int) bool {
	return joinedPlayers > 0 && redeemers*maxPercent >= gameRules.FullHousePercent*joinedPlayers
}
