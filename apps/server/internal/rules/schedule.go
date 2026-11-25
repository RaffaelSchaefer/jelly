package rules

import (
	"cmp"
	"errors"
	"slices"
	"strings"
	"unicode/utf8"
)

// The kinds of points of a program, so the app can draw each one.
const (
	ScheduleKindOrga       = "orga"
	ScheduleKindFood       = "food"
	ScheduleKindYoga       = "yoga"
	ScheduleKindTournament = "tournament"
	ScheduleKindTogether   = "together"
	// ScheduleKindNews starts the Jelly-News on the stage when the point begins.
	ScheduleKindNews = "news"
)

const (
	// A LAN of four days has about forty points, this leaves plenty of room.
	maxScheduleItems  = 300
	maxScheduleTitle  = 80
	maxScheduleDetail = 200
)

// ErrInvalidSchedule reports a schedule the server cannot keep.
var ErrInvalidSchedule = errors.New("invalid schedule")

// ScheduleItem is one point of the program of a LAN. Times are Unix milliseconds. Without an end,
// a point lasts until the next one starts.
type ScheduleItem struct {
	StartsAt int64   `json:"starts_at"`
	EndsAt   *int64  `json:"ends_at"`
	Title    string  `json:"title"`
	Detail   *string `json:"detail"`
	Kind     string  `json:"kind"`
	// Repeat brings the point back, only in the program as the orga stores it.
	Repeat *ScheduleRepeat `json:"repeat,omitempty"`
}

// ListScheduleKinds returns every kind a point can have.
func ListScheduleKinds() []string {
	return []string{
		ScheduleKindOrga, ScheduleKindFood, ScheduleKindYoga, ScheduleKindTournament,
		ScheduleKindTogether, ScheduleKindNews,
	}
}

// PrepareSchedule checks a schedule for a LAN running from `startsAt` to `endsAt` and returns it
// sorted by start, with trimmed texts and empty details left out. Every repeat has to fit the LAN.
func PrepareSchedule(items []ScheduleItem, startsAt, endsAt int64) ([]ScheduleItem, error) {
	if len(items) > maxScheduleItems {
		return nil, ErrInvalidSchedule
	}
	prepared := make([]ScheduleItem, 0, len(items))
	for _, item := range items {
		item = trimScheduleItem(item)
		if !isScheduleItemValid(item, startsAt, endsAt) || !isRepeatValid(item) {
			return nil, ErrInvalidSchedule
		}
		prepared = append(prepared, item)
	}
	occurrences := ExpandSchedule(prepared)
	if len(occurrences) > maxScheduleOccurrences {
		return nil, ErrInvalidSchedule
	}
	for _, occurrence := range occurrences {
		if !isScheduleItemValid(occurrence, startsAt, endsAt) {
			return nil, ErrInvalidSchedule
		}
	}
	slices.SortStableFunc(prepared, func(first, second ScheduleItem) int {
		return cmp.Compare(first.StartsAt, second.StartsAt)
	})
	return prepared, nil
}

// trimScheduleItem drops spaces around the texts, and an empty detail.
func trimScheduleItem(item ScheduleItem) ScheduleItem {
	item.Title = strings.TrimSpace(item.Title)
	if item.Detail != nil {
		detail := strings.TrimSpace(*item.Detail)
		item.Detail = &detail
		if detail == "" {
			item.Detail = nil
		}
	}
	return item
}

// isScheduleItemValid reports whether a point lies in the LAN, has a title and a known kind.
func isScheduleItemValid(item ScheduleItem, startsAt, endsAt int64) bool {
	if item.StartsAt < startsAt || item.StartsAt > endsAt {
		return false
	}
	if item.EndsAt != nil && (*item.EndsAt <= item.StartsAt || *item.EndsAt > endsAt) {
		return false
	}
	titleLength := utf8.RuneCountInString(item.Title)
	if titleLength == 0 || titleLength > maxScheduleTitle {
		return false
	}
	if item.Detail != nil && utf8.RuneCountInString(*item.Detail) > maxScheduleDetail {
		return false
	}
	return slices.Contains(ListScheduleKinds(), item.Kind)
}
