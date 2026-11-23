// Package logging builds the one logger of the server. The entry point creates it and passes it
// on, so no package reads a global logger.
package logging

import (
	"fmt"
	"io"
	"log/slog"
)

// DefaultLevel is the level when JELLY_LOG_LEVEL is not set.
const DefaultLevel = "info"

// New writes text logs from the given level on, one of debug, info, warn and error.
func New(output io.Writer, levelName string) (*slog.Logger, error) {
	var level slog.Level
	err := level.UnmarshalText([]byte(levelName))
	if err != nil {
		return nil, fmt.Errorf("JELLY_LOG_LEVEL: %w", err)
	}
	options := &slog.HandlerOptions{Level: level}
	return slog.New(slog.NewTextHandler(output, options)), nil
}
