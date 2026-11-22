package rules_test

import (
	"errors"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

func TestPrepareScheduleSortsAndTrims(t *testing.T) {
	blank := "  "
	items := []rules.ScheduleItem{
		{StartsAt: 3000, Title: " Turnier ", Kind: rules.ScheduleKindTournament},
		{StartsAt: 2000, Title: "Pizza", Detail: &blank, Kind: rules.ScheduleKindFood},
	}
	prepared, err := rules.PrepareSchedule(items, 1000, 5000)
	if err != nil {
		t.Fatal(err)
	}
	if prepared[0].Title != "Pizza" || prepared[0].Detail != nil || prepared[1].Title != "Turnier" {
		t.Fatalf("prepared = %+v", prepared)
	}
}

func TestPrepareScheduleRefusesWhatTheAppCannotShow(t *testing.T) {
	end := int64(1500)
	tooLate := int64(6000)
	cases := map[string]rules.ScheduleItem{
		"before the LAN":  {StartsAt: 500, Title: "A", Kind: rules.ScheduleKindOrga},
		"after the LAN":   {StartsAt: 5001, Title: "A", Kind: rules.ScheduleKindOrga},
		"without a title": {StartsAt: 2000, Title: " ", Kind: rules.ScheduleKindOrga},
		"unknown kind":    {StartsAt: 2000, Title: "A", Kind: "party"},
		"end before start": {
			StartsAt: 2000,
			EndsAt:   &end,
			Title:    "A",
			Kind:     rules.ScheduleKindOrga,
		},
		"end after the LAN": {
			StartsAt: 2000, EndsAt: &tooLate, Title: "A", Kind: rules.ScheduleKindOrga,
		},
	}
	for name, item := range cases {
		_, err := rules.PrepareSchedule([]rules.ScheduleItem{item}, 1000, 5000)
		if !errors.Is(err, rules.ErrInvalidSchedule) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
}
