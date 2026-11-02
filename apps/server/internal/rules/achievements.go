package rules

import "slices"

// Metric names a counted fact about a player that an achievement can require.
type Metric string

// Metrics the store provides for every evaluation.
const (
	MetricPokes         Metric = "pokes"
	MetricDrinks        Metric = "drinks"
	MetricEventsLAN     Metric = "events_lan"
	MetricEventsTotal   Metric = "events_total"
	MetricLANsAttended  Metric = "lans_attended"
	MetricProfileEdits  Metric = "profile_edits"
	MetricJelliesJoined Metric = "jellies_joined"
	MetricAwards        Metric = "awards"
	MetricRestHours     Metric = "rest_hours"
	MetricOwlNights     Metric = "owl_nights"
	MetricSessionHours  Metric = "session_hours"
	MetricPartners      Metric = "partners"
	MetricPartnerAreas  Metric = "partner_areas"
	MetricPokeDays      Metric = "poke_days"
	MetricEventDays     Metric = "event_days"
	MetricGhostHours    Metric = "ghost_hours"
	MetricEmoteKinds    Metric = "emote_kinds"
	MetricSameColor     Metric = "same_color_visits"
	// MetricGrantedDirectly marks achievements that their action grants, not an evaluation.
	MetricGrantedDirectly Metric = "granted_directly"
)

// Keys of achievements that their action grants directly.
const (
	AchievementFoundCompany = "found-company"
	AchievementFullHouse    = "full-house"
)

const (
	goalDrinks        = 10
	goalEventsTotal   = 3
	goalReturningLANs = 2
	goalLANsAttended  = 3
	goalOldHandLANs   = 5
	goalPartnersFirst = 3
	goalPartnersMany  = 10
	goalPartnerAreas  = 3
	goalRestHours     = 6
	goalComebackHours = 24
	goalSessionHours  = 10
	goalDaysAttended  = 3
	goalEmoteKinds    = 4
)

// Achievement is one catalog entry. `Scope` decides whether it can be earned again at each LAN.
// With a `RecordUnit` it has one stage and then only tracks the best value, so nothing is left to
// chase.
type Achievement struct {
	Key         string `json:"key"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Scope       Scope  `json:"scope"`
	Secret      bool   `json:"secret"`
	Metric      Metric `json:"-"`
	Goal        int    `json:"goal"`
	RecordUnit  string `json:"record_unit,omitempty"`
}

// FindNewAchievements returns the achievements reached by `stats` and not yet in `earnedKeys`.
func FindNewAchievements(stats map[Metric]int, earnedKeys []string) []Achievement {
	found := []Achievement{}
	for _, achievement := range ListAchievements() {
		if slices.Contains(earnedKeys, achievement.Key) {
			continue
		}
		if stats[achievement.Metric] >= achievement.Goal {
			found = append(found, achievement)
		}
	}
	return found
}

// FindRecordAchievements returns the earned achievements whose best value can still change.
func FindRecordAchievements(earnedKeys []string) []Achievement {
	found := []Achievement{}
	for _, achievement := range ListAchievements() {
		if achievement.RecordUnit != "" && slices.Contains(earnedKeys, achievement.Key) {
			found = append(found, achievement)
		}
	}
	return found
}

// FindAchievement returns the catalog entry for a key.
func FindAchievement(key string) (Achievement, bool) {
	for _, achievement := range ListAchievements() {
		if achievement.Key == key {
			return achievement, true
		}
	}
	return Achievement{}, false
}
