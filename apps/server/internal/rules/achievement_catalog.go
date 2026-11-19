package rules

import "slices"

// ListAchievements returns the catalog. Titles and descriptions are shown in the German app.
func ListAchievements() []Achievement {
	return slices.Concat(listCareAchievements(), listSocialAchievements(), listEventAchievements(),
		listShopAchievements(), listNightAchievements(), listLifetimeAchievements())
}

// listShopAchievements covers buying cosmetics in the shop.
func listShopAchievements() []Achievement {
	return []Achievement{
		{
			Key: AchievementFirstPurchase, Title: "Erster Einkauf",
			Description: "Im Shop zugegriffen.",
			Scope:       ScopePermanent, Metric: MetricPurchases, Goal: 1,
		},
		{
			Key: AchievementShopaholic, Title: "Ausverkauft",
			Description: "Jedes dauerhafte Shop-Cosmetic gehört dir.",
			Scope:       ScopePermanent, Metric: MetricPermanentPurchases,
			Goal: len(ListPermanentShopCosmetics()),
		},
	}
}

// listCareAchievements covers getting started and looking after the jelly.
func listCareAchievements() []Achievement {
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
			Key: "beauty-sleep", Title: "Schönheitsschlaf",
			Description: "Auch Jellies brauchen Ruhe.",
			Scope:       ScopeLAN, Metric: MetricRestHours, Goal: goalRestHours,
		},
		{
			Key: "stuck-here", Title: "Klebt fest",
			Description: "An 3 Tagen der LAN dabei gewesen.",
			Scope:       ScopeLAN, Metric: MetricPokeDays, Goal: goalDaysAttended,
		},
		{
			Key: "comeback", Title: "Wieder aufgetaucht",
			Description: "Schön, dass du wieder da bist!",
			Scope:       ScopeLAN, Secret: true, Metric: MetricRestHours, Goal: goalComebackHours,
		},
	}
}

// listSocialAchievements covers the stage and meeting other jellies.
func listSocialAchievements() []Achievement {
	return []Achievement{
		{
			Key: "neighbor", Title: "Hallo Nachbar", Description: "Du hast dich dazugesellt.",
			Scope: ScopeLAN, Metric: MetricJelliesJoined, Goal: 1,
		},
		{
			Key: AchievementFoundCompany, Title: "Anschluss gefunden",
			Description: "Schild hoch und jemand kam vorbei.",
			Scope:       ScopeLAN, Metric: MetricGrantedDirectly, Goal: 1,
		},
		{
			Key: AchievementConga, Title: "Konga!",
			Description: "Ihr seid eine Polonaise durch die Halle gelaufen.",
			Scope:       ScopeLAN, Metric: MetricGrantedDirectly, Goal: 1,
		},
		{
			Key: AchievementLighthouse, Title: "Leuchtturm",
			Description: "Du warst Teil eines Stapels, dessen Spitze aufleuchtete.",
			Scope:       ScopeLAN, Metric: MetricGrantedDirectly, Goal: 1,
		},
		{
			Key: AchievementLighthouseLight, Title: "Das Licht oben",
			Description: "Du warst die Spitze des Leuchtturms.",
			Scope:       ScopeLAN, Metric: MetricGrantedDirectly, Goal: 1,
		},
		{
			Key: "matching", Title: "Partnerlook", Description: "Zufall? Wohl kaum.",
			Scope: ScopeLAN, Secret: true, Metric: MetricSameColor, Goal: 1,
		},
		{
			Key: "sociable", Title: "Kontaktfreudig",
			Description: "Mit 3 verschiedenen Jellies ein Partner-Emote gemacht.",
			Scope:       ScopeLAN, Metric: MetricPartners, Goal: goalPartnersFirst,
		},
		{
			Key: "well-known", Title: "Bekannt wie ein bunter Glibber",
			Description: "Mit 10 verschiedenen Jellies ein Partner-Emote gemacht.",
			Scope:       ScopeLAN, Metric: MetricPartners, Goal: goalPartnersMany,
		},
		{
			Key: "across-the-room", Title: "Quer durch den Saal",
			Description: "Partner-Emotes in 3 anderen Bereichen des Saals.",
			Scope:       ScopeLAN, Metric: MetricPartnerAreas, Goal: goalPartnerAreas,
		},
		{
			Key: "expressive", Title: "Gefühlsecht", Description: "4 verschiedene Emotes gezeigt.",
			Scope: ScopePermanent, Metric: MetricEmoteKinds, Goal: goalEmoteKinds,
		},
	}
}

// listEventAchievements covers event codes and prizes.
func listEventAchievements() []Achievement {
	return []Achievement{
		{
			Key: "first-event", Title: "Mittendrin", Description: "Dein erstes Event dieser LAN.",
			Scope: ScopeLAN, Metric: MetricEventsLAN, Goal: 1,
		},
		{
			Key: "event-hopper", Title: "Eventhopper", Description: "An 3 Tagen bei Events dabei.",
			Scope: ScopeLAN, Metric: MetricEventDays, Goal: goalDaysAttended,
		},
		{
			Key: AchievementFullHouse, Title: "Volle Bude",
			Description: "Ein Event, bei dem gefühlt alle dabei waren.",
			Scope:       ScopeLAN, Metric: MetricGrantedDirectly, Goal: 1,
		},
		{
			Key: "tournament", Title: "Turnierheld", Description: "Bei 3 Events mitgemacht.",
			Scope: ScopePermanent, Metric: MetricEventsTotal, Goal: goalEventsTotal,
		},
		{
			Key: "honored", Title: "Ausgezeichnet", Description: "Die Orga hat dich geehrt.",
			Scope: ScopePermanent, Metric: MetricAwards, Goal: 1,
		},
	}
}

// listNightAchievements covers long nights.
func listNightAchievements() []Achievement {
	return []Achievement{
		{
			Key: "ghost-hour", Title: "Geisterstunde",
			Description: "Mitternacht, und du glibberst noch.",
			Scope:       ScopeLAN, Secret: true, Metric: MetricGhostHours, Goal: 1,
		},
		{
			Key: "night-owl", Title: "Nachteule", Description: "Um 4 Uhr nachts noch dabei.",
			Scope: ScopeLAN, Secret: true, Metric: MetricOwlNights, Goal: 1,
			RecordUnit: "Nächte",
		},
		{
			Key: "marathon", Title: "Marathon", Description: "10 Stunden am Stück aktiv.",
			Scope: ScopeLAN, Metric: MetricSessionHours, Goal: goalSessionHours,
			RecordUnit: "Stunden",
		},
	}
}

// listLifetimeAchievements covers attendance across LANs.
func listLifetimeAchievements() []Achievement {
	return []Achievement{
		{
			Key: "returning", Title: "Wiederholungstäter",
			Description: "Einmal LAN reicht eben nicht.",
			Scope:       ScopePermanent, Metric: MetricLANsAttended, Goal: goalReturningLANs,
		},
		{
			Key: "veteran", Title: "LAN-Veteran", Description: "Bei 3 LANs dabei gewesen.",
			Scope: ScopePermanent, Metric: MetricLANsAttended, Goal: goalLANsAttended,
		},
		{
			Key: "old-hand", Title: "Urgestein", Description: "Du gehörst zum Inventar.",
			Scope: ScopePermanent, Metric: MetricLANsAttended, Goal: goalOldHandLANs,
		},
	}
}
