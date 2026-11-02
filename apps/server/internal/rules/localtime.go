package rules

const (
	// NightOwlHour is the local hour that earns Nachteule.
	NightOwlHour = 4
	// GhostHour is the local hour that earns Geisterstunde.
	GhostHour = 0
	// A LAN day starts here, so staying up late does not count as another day.
	lanDayStartHour = 6
)

// LocalMoment is a time in the time zone of the LAN. `Day` is any number that grows by one per
// calendar day.
type LocalMoment struct {
	Day  int
	Hour int
}

// CountLANDays counts the different LAN days of these moments.
func CountLANDays(moments []LocalMoment) int {
	days := map[int]bool{}
	for _, moment := range moments {
		day := moment.Day
		if moment.Hour < lanDayStartHour {
			day--
		}
		days[day] = true
	}
	return len(days)
}

// CountNightsAtHour counts the different calendar days with a moment in this hour.
func CountNightsAtHour(moments []LocalMoment, hour int) int {
	nights := map[int]bool{}
	for _, moment := range moments {
		if moment.Hour == hour {
			nights[moment.Day] = true
		}
	}
	return len(nights)
}
