package rules

import "fmt"

const (
	// A month is longer than any LAN, and small enough that seconds stay far from an overflow when
	// they become milliseconds.
	maxRuleSeconds = 30 * 24 * 60 * 60
	maxRuleXP      = 10_000
	maxXPPerLevel  = 1_000_000
	// maxRuleCount limits what counts per player or per stack.
	maxRuleCount = 1_000
	// maxRuleTotal limits what counts for the whole server.
	maxRuleTotal = 100_000
	// The room is 21 by 40. A test can still count everyone as close with a larger distance.
	maxNearDistance = 1_000.0
	maxWalkSpeed    = 100.0
	minRuleDistance = 0.01
	minRulePercent  = 1
	// A hall of a LAN is between a small room and a sports hall, a jelly between a doll and a
	// person.
	minRoomMeters  = 1.0
	maxRoomMeters  = 1_000.0
	minJellyMeters = 0.05
	maxJellyMeters = 10.0
)

// RuleLimit is the range of one rule.
type RuleLimit struct {
	// Name is the name of the rule in the API.
	Name string
	// Value is the current value.
	Value float64
	// Lowest and Highest are the first and last allowed values.
	Lowest  float64
	Highest float64
}

// InvalidRuleError names the rule that is out of range. It counts as [ErrInvalidRules].
type InvalidRuleError struct {
	Limit RuleLimit
}

// Error describes the rule for logs.
func (invalid InvalidRuleError) Error() string {
	return fmt.Sprintf("rule %s is out of range", invalid.Limit.Name)
}

// Unwrap makes the error count as [ErrInvalidRules].
func (InvalidRuleError) Unwrap() error {
	return ErrInvalidRules
}

// ListRuleLimits returns the range of every rule with its current value.
func ListRuleLimits(gameRules Rules) []RuleLimit {
	return append(listPublicRuleLimits(gameRules.PublicRules),
		countLimit("max_players", gameRules.MaxPlayers, 1, maxRuleTotal),
		countLimit("max_streams", gameRules.MaxStreams, 1, maxRuleTotal),
		countLimit("max_player_streams", gameRules.MaxPlayerStreams, 1, maxRuleCount),
	)
}

// listPublicRuleLimits returns the ranges of the rules that clients can read.
func listPublicRuleLimits(public PublicRules) []RuleLimit {
	return []RuleLimit{
		countLimit("xp_per_level", public.XPPerLevel, 1, maxXPPerLevel),
		countLimit("coins_per_level", public.CoinsPerLevel, 0, maxCoinsPerLevel),
		secondsLimit("poke_interval", public.PokeIntervalSeconds, 1),
		countLimit("poke_xp", public.PokeXP, 0, maxRuleXP),
		{"poke_max_ticks", float64(public.PokeMaxTicks), 1, maxRuleCount},
		countLimit("food_xp", public.FoodXP, 0, maxRuleXP),
		countLimit("drink_xp", public.DrinkXP, 0, maxRuleXP),
		secondsLimit("report_cooldown", public.ReportCooldownSeconds, 1),
		secondsLimit("report_window", public.ReportWindowSeconds, 1),
		countLimit("reports_per_window", public.ReportsPerWindow, 0, maxRuleCount),
		secondsLimit("presence_window", public.PresenceWindowSeconds, 1),
		secondsLimit("emote_cooldown", public.EmoteCooldownSeconds, 0),
		secondsLimit("partner_invite_seconds", public.PartnerInviteSeconds, 1),
		countLimit("partner_xp", public.PartnerXP, 0, maxRuleXP),
		countLimit("full_house_percent", public.FullHousePercent, minRulePercent, maxPercent),
		secondsLimit("snack_run_seconds", public.SnackRunSeconds, 1),
		secondsLimit("trip_seconds", public.TripSeconds, 1),
		secondsLimit("follow_seconds", public.FollowSeconds, 1),
		{"near_distance", public.NearDistance, minRuleDistance, maxNearDistance},
		{"walk_speed", public.WalkSpeed, minRuleDistance, maxWalkSpeed},
		secondsLimit("stack_seconds", public.StackSeconds, 1),
		countLimit("stack_max_members", public.StackMaxMembers, NoStackLimit, maxRuleCount),
		secondsLimit("highlight_seconds", public.HighlightSeconds, 1),
		secondsLimit("highlight_cooldown", public.HighlightCooldownSeconds, 0),
		{"room_width", public.RoomWidthMeters, minRoomMeters, maxRoomMeters},
		{"room_depth", public.RoomDepthMeters, minRoomMeters, maxRoomMeters},
		{"jelly_width", public.JellyWidthMeters, minJellyMeters, maxJellyMeters},
	}
}

// countLimit describes a rule that counts something.
func countLimit(name string, value, lowest, highest int) RuleLimit {
	return RuleLimit{name, float64(value), float64(lowest), float64(highest)}
}

// secondsLimit describes a duration. A cooldown can be switched off, so it starts at 0.
func secondsLimit(name string, value, lowest int64) RuleLimit {
	return RuleLimit{name, float64(value), float64(lowest), maxRuleSeconds}
}

// ValidateRules checks that all values are in range, and names the first one that is not.
func ValidateRules(gameRules Rules) error {
	for _, limit := range ListRuleLimits(gameRules) {
		if limit.Value < limit.Lowest || limit.Value > limit.Highest {
			return InvalidRuleError{Limit: limit}
		}
	}
	return nil
}
