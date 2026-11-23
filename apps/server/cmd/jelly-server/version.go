package main

import (
	"context"
	"log/slog"
	"runtime"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/logging"
)

// The image build sets both with -ldflags "-X main.serverVersion=… -X main.serverRevision=…".
//
//nolint:gochecknoglobals // the linker can only set package variables, nothing changes them later.
var (
	serverVersion  = "dev"
	serverRevision = "unknown"
)

// logServerStart names the build and settings, so the log shows what runs after a deploy.
func logServerStart(ctx context.Context, logger *slog.Logger, databasePath string) {
	logger.InfoContext(ctx, "server starting",
		"version", serverVersion,
		"revision", serverRevision,
		"api_version", api.APIVersion,
		"go_version", runtime.Version(),
		"log_level", readEnv("JELLY_LOG_LEVEL", logging.DefaultLevel),
		"database", databasePath,
	)
}
