// Command jelly-server starts the Jelly server or runs one of its tools.
//
//	jelly-server                  starts the server
//	jelly-server create-lan ...   creates a LAN, see -h for options
//	jelly-server simulate ...     plays many jellies against a server, see -h for options
//	jelly-server openapi          prints the API contract as OpenAPI
//	jelly-server healthcheck      exits 0 if the server on JELLY_ADDR is healthy, for Docker
//
// Settings come from the environment variables JELLY_DB, JELLY_ADDR, JELLY_STAGE_KEY,
// JELLY_ADMIN_SECRET, JELLY_MIN_CLIENT_VERSION and JELLY_LOG_LEVEL.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

var errUnknownCommand = errors.New("unknown command")

func main() {
	logger, err := createLogger(os.Stderr, readEnv("JELLY_LOG_LEVEL", defaultLogLevel))
	if err != nil {
		// Without a valid level there is no logger yet, so the default one reports the mistake.
		fallback := slog.New(slog.NewTextHandler(os.Stderr, nil))
		fallback.Error("program failed", "error", err)
		os.Exit(1)
	}
	err = runProgram(logger)
	if err != nil {
		logger.Error("program failed", "error", err)
		os.Exit(1)
	}
}

// runProgram creates the app context and runs the selected command.
func runProgram(logger *slog.Logger) error {
	appCtx, stopSignals := signal.NotifyContext(
		context.Background(), os.Interrupt, syscall.SIGTERM,
	)
	defer stopSignals()

	arguments := os.Args[1:]
	if len(arguments) == 0 {
		return runServer(appCtx, logger)
	}
	if arguments[0] == commandCreateLAN {
		return runCreateLAN(appCtx, arguments[1:], logger)
	}
	if arguments[0] == commandSimulate {
		return runSimulate(appCtx, arguments[1:], logger)
	}
	if arguments[0] == commandOpenAPI {
		return runOpenAPI()
	}
	if arguments[0] == commandHealthcheck {
		return runHealthcheck(appCtx)
	}
	return fmt.Errorf("%w: %q", errUnknownCommand, arguments[0])
}

// readDatabasePath names the database file from JELLY_DB.
func readDatabasePath() string {
	return readEnv("JELLY_DB", "jelly.db")
}

// openDatabase opens the database named by the environment.
func openDatabase(ctx context.Context) (*store.Store, error) {
	database, err := store.Open(ctx, readDatabasePath())
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	return database, nil
}

// readEnv reads an environment variable with a fallback.
func readEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
