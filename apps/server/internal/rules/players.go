package rules

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	// MaxNameLength is the longest allowed name in characters.
	MaxNameLength = 24
	// Only the admin hands out names with this prefix, so a player cannot block a name reset.
	resetNamePrefix = "Jelly-"
)

var (
	// ErrInvalidName reports an empty or too long name, or one with characters outside the list.
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
	if !buildNamePattern().MatchString(trimmedName) {
		return "", ErrInvalidName
	}
	if strings.HasPrefix(BuildNameKey(trimmedName), BuildNameKey(resetNamePrefix)) {
		return "", ErrInvalidName
	}
	return trimmedName, nil
}

// buildNamePattern allows Latin letters, umlauts, digits, spaces and a few marks, with at least
// one letter or digit. Everything else could hide a name or imitate someone on the stage.
func buildNamePattern() *regexp.Regexp {
	const letters = `A-Za-zÄÖÜäöüß0-9`
	const marks = ` ._'-`
	const anyAllowed = `[` + letters + marks + `]*`
	return regexp.MustCompile(`^` + anyAllowed + `[` + letters + `]` + anyAllowed + `$`)
}

// BuildResetName returns the neutral name that replaces a name after moderation.
func BuildResetName(playerID int64) string {
	return resetNamePrefix + strconv.FormatInt(playerID, 10)
}

// BuildNameKey returns the value used to compare names regardless of case.
func BuildNameKey(name string) string {
	return strings.ToLower(name)
}

// ListColors returns the colors a jelly can have.
func ListColors() []CatalogEntry {
	return []CatalogEntry{
		{Key: "mint", Label: "Aqua"},
		{Key: "lilac", Label: "Flieder"},
		{Key: "peach", Label: "Pfirsich"},
	}
}

// ValidateColor checks a color against the fixed list.
func ValidateColor(color string) error {
	if containsKey(ListColors(), color) {
		return nil
	}
	return ErrInvalidColor
}
