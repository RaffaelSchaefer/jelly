package rules

// Jelly-News present what happened on the stage during the last hour.
const (
	// NewsWindowMillis is how far back the news look.
	NewsWindowMillis int64 = 60 * 60 * millisPerSecond
	// NewsMaxAchievements keeps the show short when many jellies earned something.
	NewsMaxAchievements = 5
	// A stack is news from two jellies on, one alone is just standing.
	minNewsStackMembers = 2
)

// FindDueNews returns the news point of the program that should run now and did not start yet.
// `startedFor` is the start of the last news point that already began.
func FindDueNews(
	gameRules Rules, items []ScheduleItem, startedFor, now int64,
) (ScheduleItem, bool) {
	var due ScheduleItem
	found := false
	for _, item := range items {
		isOpen := item.StartsAt <= now && now < CalculateNewsEnd(gameRules, item)
		if item.Kind == ScheduleKindNews && item.StartsAt > startedFor && isOpen {
			due, found = item, true
		}
	}
	return due, found
}

// CalculateNewsEnd returns when the news of a program point end, after `news_seconds` without an
// end of their own.
func CalculateNewsEnd(gameRules Rules, item ScheduleItem) int64 {
	if item.EndsAt != nil {
		return *item.EndsAt
	}
	return item.StartsAt + gameRules.NewsSeconds*millisPerSecond
}

// FindNextScheduleItem returns the next point after `now` that is not news itself. The items are
// sorted by start, as [PrepareSchedule] returns them.
func FindNextScheduleItem(items []ScheduleItem, now int64) (ScheduleItem, bool) {
	for _, item := range items {
		if item.Kind != ScheduleKindNews && item.StartsAt > now {
			return item, true
		}
	}
	return ScheduleItem{}, false
}

// FindTallestStack returns the members of the highest stack, the first one on a tie. Without a
// stack of at least two jellies it is empty.
func FindTallestStack(stacks [][]int64) []int64 {
	tallest := []int64{}
	for _, members := range stacks {
		if len(members) >= minNewsStackMembers && len(members) > len(tallest) {
			tallest = members
		}
	}
	return tallest
}
