package rules_test

import (
	"errors"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const (
	testHour   = int64(60 * 60 * 1000)
	testMinute = int64(60 * 1000)
)

// newsEveryHalfHour starts at `startsAt` and comes back every 30 minutes for two hours.
func newsEveryHalfHour(startsAt int64) rules.ScheduleItem {
	endsAt := startsAt + 2*testMinute
	return rules.ScheduleItem{
		StartsAt: startsAt, EndsAt: &endsAt, Title: "News", Kind: rules.ScheduleKindNews,
		Repeat: &rules.ScheduleRepeat{EveryMinutes: 30, Until: startsAt + 2*testHour},
	}
}

func TestExpandScheduleWritesOutEveryRepeat(t *testing.T) {
	breakfast := rules.ScheduleItem{StartsAt: 45 * testMinute, Title: "Frühstück", Kind: "food"}
	expanded := rules.ExpandSchedule([]rules.ScheduleItem{newsEveryHalfHour(0), breakfast})
	starts := []int64{}
	for _, item := range expanded {
		starts = append(starts, item.StartsAt/testMinute)
		if item.Repeat != nil {
			t.Fatalf("an occurrence keeps its repeat: %+v", item)
		}
	}
	want := []int64{0, 30, 45, 60, 90, 120}
	if len(starts) != len(want) {
		t.Fatalf("starts = %v, want %v", starts, want)
	}
	for index := range want {
		if starts[index] != want[index] {
			t.Fatalf("starts = %v, want %v", starts, want)
		}
	}
	if *expanded[1].EndsAt != 32*testMinute {
		t.Fatalf("an occurrence keeps its length, ends at %d", *expanded[1].EndsAt)
	}
}

func TestPrepareScheduleChecksEveryRepeat(t *testing.T) {
	lanEnd := 3 * testHour
	tooOften := newsEveryHalfHour(0)
	tooOften.Repeat.EveryMinutes = 1
	pastTheLAN := newsEveryHalfHour(0)
	pastTheLAN.Repeat.Until = 4 * testHour
	endsBeforeStart := newsEveryHalfHour(testHour)
	endsBeforeStart.Repeat.Until = 0
	cases := []struct {
		name string
		item rules.ScheduleItem
		want error
	}{
		{"every half hour", newsEveryHalfHour(0), nil},
		{"too often", tooOften, rules.ErrInvalidSchedule},
		{"past the end of the LAN", pastTheLAN, rules.ErrInvalidSchedule},
		{"ends before it starts", endsBeforeStart, rules.ErrInvalidSchedule},
	}
	for _, testCase := range cases {
		_, err := rules.PrepareSchedule([]rules.ScheduleItem{testCase.item}, 0, lanEnd)
		if !errors.Is(err, testCase.want) {
			t.Errorf("%s: got %v, want %v", testCase.name, err, testCase.want)
		}
	}
}

func TestNewsCountTheTimeSinceTheNewsBefore(t *testing.T) {
	expanded := rules.ExpandSchedule([]rules.ScheduleItem{newsEveryHalfHour(2 * testHour)})
	if got := rules.FindNewsWindowStart(expanded, 2*testHour); got != testHour {
		t.Fatalf("first news count from %d, want one hour back", got)
	}
	if got := rules.FindNewsWindowStart(expanded, 3*testHour); got != 2*testHour+30*testMinute {
		t.Fatalf("later news count from %d, want the news before", got)
	}
}
