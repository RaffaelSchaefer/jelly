package api

import (
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

func TestBotsPickTheHighestTowerWithRoom(t *testing.T) {
	stacks := []store.Stack{
		{ID: 1, X: 10, Y: 10, EndsAt: 0, MemberIDs: []int64{1}},
		{ID: 2, X: 20, Y: 20, EndsAt: 0, MemberIDs: []int64{2, 3, 4}},
		{ID: 3, X: 30, Y: 30, EndsAt: 0, MemberIDs: []int64{5, 6, 7, 8, 9}},
	}
	if tower, found := pickBotTower(stacks); !found || tower.ID != 2 {
		t.Errorf("tower = %+v, %v", tower, found)
	}
	// A tower of five is high enough, the bot starts the next one.
	if tower, found := pickBotTower(stacks[2:]); found {
		t.Errorf("tower = %+v", tower)
	}
}
