package rules

import (
	"cmp"
	"slices"
)

const (
	// A repeat closer than this would flood the program, a day is the longest that makes sense.
	minRepeatMinutes = 5
	maxRepeatMinutes = 24 * 60
	// maxScheduleOccurrences limits the points of a program with every repeat counted.
	maxScheduleOccurrences = 2_000
	millisPerMinute        = 60 * millisPerSecond
)

// ScheduleRepeat makes one point of the program come back every `EveryMinutes` until `Until`.
type ScheduleRepeat struct {
	EveryMinutes int   `json:"every_minutes"`
	Until        int64 `json:"until"`
}

// isRepeatValid reports whether a repeat has a sensible step and ends after its first start.
func isRepeatValid(item ScheduleItem) bool {
	repeat := item.Repeat
	return repeat == nil || (repeat.EveryMinutes >= minRepeatMinutes &&
		repeat.EveryMinutes <= maxRepeatMinutes && repeat.Until >= item.StartsAt)
}

// listOccurrences returns every time a point takes place, each without its repeat. A point
// without a repeat takes place once.
func listOccurrences(item ScheduleItem) []ScheduleItem {
	repeat := item.Repeat
	item.Repeat = nil
	if repeat == nil {
		return []ScheduleItem{item}
	}
	step := int64(repeat.EveryMinutes) * millisPerMinute
	occurrences := []ScheduleItem{}
	for offset := int64(0); item.StartsAt+offset <= repeat.Until; offset += step {
		occurrence := item
		occurrence.StartsAt += offset
		if item.EndsAt != nil {
			endsAt := *item.EndsAt + offset
			occurrence.EndsAt = &endsAt
		}
		occurrences = append(occurrences, occurrence)
		if len(occurrences) > maxScheduleOccurrences {
			break
		}
	}
	return occurrences
}

// ExpandSchedule returns every single point of a program with its repeats written out, sorted by
// start. Apps and the stage read the program like this, so only the admin page knows repeats.
func ExpandSchedule(items []ScheduleItem) []ScheduleItem {
	expanded := []ScheduleItem{}
	for _, item := range items {
		expanded = append(expanded, listOccurrences(item)...)
	}
	slices.SortStableFunc(expanded, func(first, second ScheduleItem) int {
		return cmp.Compare(first.StartsAt, second.StartsAt)
	})
	return expanded
}

// FindNewsWindowStart returns since when news starting at `startsAt` count: the start of the news
// before, or [NewsWindowMillis] back for the first news. The items are expanded and sorted.
func FindNewsWindowStart(items []ScheduleItem, startsAt int64) int64 {
	windowStart := startsAt - NewsWindowMillis
	for _, item := range items {
		if item.Kind == ScheduleKindNews && item.StartsAt < startsAt {
			windowStart = item.StartsAt
		}
	}
	return windowStart
}
