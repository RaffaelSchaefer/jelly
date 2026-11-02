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
	MetricMidnightPoke  Metric = "midnight_poke"
)

const (
	goalDrinks        = 10
	goalEventsTotal   = 3
	goalLANsAttended  = 3
	goalJelliesJoined = 10
	goalRestHours     = 6
)

// Achievement is one catalog entry. `Scope` decides whether it can be earned again at each LAN.
type Achievement struct {
	Key         string `json:"key"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Scope       Scope  `json:"scope"`
	Secret      bool   `json:"secret"`
	Metric      Metric `json:"-"`
	Goal        int    `json:"goal"`
}

// ListAchievements returns the catalog. Titles and descriptions are shown in the German app.
func ListAchievements() []Achievement {
	return []Achievement{
		{
			Key: "hatched", Title: "Frisch geschlüpft", Description: "Willkommen auf der LAN!",
			Scope: ScopePermanent, Metric: MetricPokes, Goal: 1,
		},
		{
			Key: "styled", Title: "Schick gemacht", Description: "Ein Jelly will gut aussehen.",
			Scope: ScopePermanent, Metric: MetricProfileEdits, Goal: 1,
		},
		{
			Key: "hydrated", Title: "Gut hydriert", Description: "10 Getränke geholt.",
			Scope: ScopeLAN, Metric: MetricDrinks, Goal: goalDrinks,
		},
		{
			Key: "first-event", Title: "Mittendrin", Description: "Dein erstes Event dieser LAN.",
			Scope: ScopeLAN, Metric: MetricEventsLAN, Goal: 1,
		},
		{
			Key: "tournament", Title: "Turnierheld", Description: "Bei 3 Events mitgemacht.",
			Scope: ScopePermanent, Metric: MetricEventsTotal, Goal: goalEventsTotal,
		},
		{
			Key: "neighbor", Title: "Hallo Nachbar", Description: "Du hast dich dazugesellt.",
			Scope: ScopeLAN, Metric: MetricJelliesJoined, Goal: 1,
		},
		{
			Key: "sociable", Title: "Kontaktfreudig", Description: "Bei 10 Jellies vorbeigeschaut.",
			Scope: ScopeLAN, Metric: MetricJelliesJoined, Goal: goalJelliesJoined,
		},
		{
			Key: "beauty-sleep", Title: "Schönheitsschlaf",
			Description: "Auch Jellies brauchen Ruhe.",
			Scope:       ScopeLAN, Metric: MetricRestHours, Goal: goalRestHours,
		},
		{
			Key: "witching-hour", Title: "Geisterstunde",
			Description: "Mitternacht, und du glibberst.",
			Scope:       ScopeLAN, Secret: true, Metric: MetricMidnightPoke, Goal: 1,
		},
		{
			Key: "honored", Title: "Ausgezeichnet", Description: "Die Orga hat dich geehrt.",
			Scope: ScopePermanent, Metric: MetricAwards, Goal: 1,
		},
		{
			Key: "veteran", Title: "LAN-Veteran", Description: "Bei 3 LANs dabei gewesen.",
			Scope: ScopePermanent, Metric: MetricLANsAttended, Goal: goalLANsAttended,
		},
	}
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

// FindAchievement returns the catalog entry for a key.
func FindAchievement(key string) (Achievement, bool) {
	for _, achievement := range ListAchievements() {
		if achievement.Key == key {
			return achievement, true
		}
	}
	return Achievement{}, false
}
