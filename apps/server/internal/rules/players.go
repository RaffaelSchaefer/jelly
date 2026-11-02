package rules

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"
)

// MaxNameLength is the longest allowed name in characters.
const MaxNameLength = 24

var (
	// ErrInvalidName reports an empty or too long name, or one with control characters.
	ErrInvalidName = errors.New("invalid name")
	// ErrInvalidColor reports a color the app does not have.
	ErrInvalidColor = errors.New("invalid color")
)

// NormalizeName trims and validates a name using the same rules as the app.
func NormalizeName(name string) (string, error) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" || !utf8.ValidString(trimmedName) {
		return "", ErrInvalidName
	}
	if utf8.RuneCountInString(trimmedName) > MaxNameLength {
		return "", ErrInvalidName
	}
	if strings.ContainsFunc(trimmedName, unicode.IsControl) {
		return "", ErrInvalidName
	}
	return trimmedName, nil
}

// BuildNameKey returns the value used to compare names regardless of case.
func BuildNameKey(name string) string {
	return strings.ToLower(name)
}

// ValidateColor checks a color against the colors of the app.
func ValidateColor(color string) error {
	switch color {
	case "mint", "lilac", "peach":
		return nil
	default:
		return ErrInvalidColor
	}
}
