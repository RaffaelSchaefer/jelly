package rules_test

import (
	"slices"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

func TestFindDueNews(t *testing.T) {
	t.Parallel()
	gameRules := rules.DefaultRules()
	end := int64(5000)
	items := []rules.ScheduleItem{
		{StartsAt: 1000, Kind: rules.ScheduleKindNews, Title: "early"},
		{StartsAt: 2000, Kind: rules.ScheduleKindFood, Title: "food"},
		{StartsAt: 3000, EndsAt: &end, Kind: rules.ScheduleKindNews, Title: "late"},
	}
	cases := []struct {
		name       string
		startedFor int64
		now        int64
		want       string
	}{
		{"before any", 0, 500, ""},
		{"first open", 0, 1500, "early"},
		{"first over after news_seconds", 0, 1000 + gameRules.NewsSeconds*1000, ""},
		{"second open until its end", 1000, 4999, "late"},
		{"second already started", 3000, 4000, ""},
		{"second over", 1000, 5000, ""},
	}
	for _, testCase := range cases {
		due, found := rules.FindDueNews(gameRules, items, testCase.startedFor, testCase.now)
		if found != (testCase.want != "") || due.Title != testCase.want {
			t.Errorf("%s: got %q %v, want %q", testCase.name, due.Title, found, testCase.want)
		}
	}
}

func TestFindNextScheduleItemSkipsNews(t *testing.T) {
	t.Parallel()
	items := []rules.ScheduleItem{
		{StartsAt: 1000, Kind: rules.ScheduleKindFood, Title: "past"},
		{StartsAt: 2000, Kind: rules.ScheduleKindNews, Title: "news"},
		{StartsAt: 3000, Kind: rules.ScheduleKindTournament, Title: "cup"},
	}
	next, found := rules.FindNextScheduleItem(items, 1500)
	if !found || next.Title != "cup" {
		t.Fatalf("got %q %v, want cup", next.Title, found)
	}
	_, found = rules.FindNextScheduleItem(items, 3000)
	if found {
		t.Fatal("nothing comes after the last point")
	}
}

func TestFindTallestStack(t *testing.T) {
	t.Parallel()
	got := rules.FindTallestStack([][]int64{{1}, {2, 3}, {4, 5, 6}, {7, 8, 9}})
	if !slices.Equal(got, []int64{4, 5, 6}) {
		t.Fatalf("tallest = %v", got)
	}
	if got := rules.FindTallestStack([][]int64{{1}}); len(got) != 0 {
		t.Fatalf("one jelly is no stack: %v", got)
	}
}
