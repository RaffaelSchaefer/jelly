package rules

import (
	"errors"
	"slices"
)

// ErrUnknownSkin reports a skin that the cosmetic does not have.
var ErrUnknownSkin = errors.New("unknown skin")

// Skin is a named look of one cosmetic, such as one flag of the flagpole. It comes with the
// cosmetic, so whoever wears that may choose any of its skins.
type Skin struct {
	Key  string `json:"key"`
	Name string `json:"name"`
}

// ValidateSkin checks that `skin` is one of the skins of the cosmetic. Nil keeps its plain look.
func ValidateSkin(cosmetic Cosmetic, skin *string) error {
	if skin == nil {
		return nil
	}
	isKnown := slices.ContainsFunc(cosmetic.Skins, func(known Skin) bool {
		return known.Key == *skin
	})
	if !isKnown {
		return ErrUnknownSkin
	}
	return nil
}
