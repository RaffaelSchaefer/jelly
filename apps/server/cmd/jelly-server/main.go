// Command jelly-server starts the Jelly server or runs one of its tools.
//
//	jelly-server                  starts the server
//	jelly-server create-lan ...   creates a LAN, see -h for options
//
// Settings come from the environment variables JELLY_DB, JELLY_ADDR, JELLY_STAGE_KEY and
// JELLY_ADMIN_SECRET.
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
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	err := runProgram(logger)
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
	return fmt.Errorf("%w: %q", errUnknownCommand, arguments[0])
}

// openDatabase opens the database named by the environment.
func openDatabase(ctx context.Context) (*store.Store, error) {
	database, err := store.Open(ctx, readEnv("JELLY_DB", "jelly.db"))
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
