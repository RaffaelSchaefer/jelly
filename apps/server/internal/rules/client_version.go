package rules

import (
	"errors"
	"strconv"
	"strings"
)

// clientVersionParts is the number of parts in a version such as 1.2.3.
const clientVersionParts = 3

// ErrInvalidClientVersion reports a client version that is not in the form 1.2.3.
var ErrInvalidClientVersion = errors.New("invalid client version")

// ValidateClientVersion accepts versions in the form 1.2.3. Empty means no minimum.
func ValidateClientVersion(version string) error {
	if version == "" {
		return nil
	}
	parts := strings.Split(version, ".")
	if len(parts) != clientVersionParts {
		return ErrInvalidClientVersion
	}
	for _, part := range parts {
		_, err := strconv.ParseUint(part, 10, 32)
		if err != nil {
			return ErrInvalidClientVersion
		}
	}
	return nil
}
