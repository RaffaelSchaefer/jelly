package rules_test

import (
	"errors"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

func TestValidateSkinAcceptsOnlyTheSkinsOfTheCosmetic(t *testing.T) {
	flagpole := rules.Cosmetic{Key: "flagpole", Skins: []rules.Skin{{Key: "ucb", Name: "UCB"}}}
	ucb, pride := "ucb", "pride"
	cases := []struct {
		name     string
		cosmetic rules.Cosmetic
		skin     *string
		want     error
	}{
		{"plain look", flagpole, nil, nil},
		{"own skin", flagpole, &ucb, nil},
		{"other skin", flagpole, &pride, rules.ErrUnknownSkin},
		{"cosmetic without skins", rules.Cosmetic{Key: "beanie"}, &ucb, rules.ErrUnknownSkin},
	}
	for _, testCase := range cases {
		if got := rules.ValidateSkin(
			testCase.cosmetic,
			testCase.skin,
		); !errors.Is(
			got,
			testCase.want,
		) {
			t.Errorf("%s: got %v, want %v", testCase.name, got, testCase.want)
		}
	}
}

func TestEveryCatalogSkinHasAUniqueKeyAndAName(t *testing.T) {
	for _, cosmetic := range rules.ListCosmetics() {
		seen := map[string]bool{}
		for _, skin := range cosmetic.Skins {
			if skin.Key == "" || skin.Name == "" || seen[skin.Key] {
				t.Errorf("%s: skin %+v", cosmetic.Key, skin)
			}
			seen[skin.Key] = true
		}
	}
}
