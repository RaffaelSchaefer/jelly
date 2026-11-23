package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"runtime"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
)

const defaultLogLevel = "info"

// The image build sets both with -ldflags "-X main.serverVersion=… -X main.serverRevision=…".
//
//nolint:gochecknoglobals // the linker can only set package variables, nothing changes them later.
var (
	serverVersion  = "dev"
	serverRevision = "unknown"
)

// createLogger writes text logs from the given level on, one of debug, info, warn and error.
func createLogger(output io.Writer, levelName string) (*slog.Logger, error) {
	var level slog.Level
	err := level.UnmarshalText([]byte(levelName))
	if err != nil {
		return nil, fmt.Errorf("JELLY_LOG_LEVEL: %w", err)
	}
	options := &slog.HandlerOptions{Level: level}
	return slog.New(slog.NewTextHandler(output, options)), nil
}

// logServerStart names the build and settings, so the log shows what runs after a deploy.
func logServerStart(ctx context.Context, logger *slog.Logger, databasePath string) {
	logger.InfoContext(ctx, "server starting",
		"version", serverVersion,
		"revision", serverRevision,
		"api_version", api.APIVersion,
		"go_version", runtime.Version(),
		"log_level", readEnv("JELLY_LOG_LEVEL", defaultLogLevel),
		"database", databasePath,
	)
}
