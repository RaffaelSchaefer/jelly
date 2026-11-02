package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/simulator"
)

const (
	commandSimulate    = "simulate"
	simulatorHTTPLimit = 30 * time.Second
)

var errMissingJoinCode = errors.New("JELLY_JOIN_CODE is required")

// runSimulate plays against a running server until a signal or the time limit ends it. It opens no
// database, so it also works against the VPS.
func runSimulate(ctx context.Context, arguments []string, logger *slog.Logger) error {
	flags := flag.NewFlagSet(commandSimulate, flag.ContinueOnError)
	address := flags.String("url", "http://localhost:8080", "address of the server")
	players := flags.Int("players", simulator.DefaultPlayers, "number of jellies")
	minDelay := flags.Duration("min-delay", simulator.DefaultMinDelay, "shortest wait")
	maxDelay := flags.Duration("max-delay", simulator.DefaultMaxDelay, "longest wait")
	limit := flags.Duration("duration", 0, "ends the run after this time, 0 runs until a signal")
	err := flags.Parse(arguments)
	if err != nil {
		return fmt.Errorf("parse options: %w", err)
	}
	joinCode := os.Getenv("JELLY_JOIN_CODE")
	if joinCode == "" {
		return errMissingJoinCode
	}
	if *limit > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, *limit)
		defer cancel()
	}
	config := simulator.Config{
		BaseURL: *address, JoinCode: joinCode, RunID: simulator.GenerateRunID(), Players: *players,
		MinDelay: *minDelay, MaxDelay: *maxDelay, Now: time.Now,
	}
	httpClient := &http.Client{Timeout: simulatorHTTPLimit}
	stats, err := simulator.Run(ctx, httpClient, config, logger)
	if err != nil {
		return fmt.Errorf("run simulator: %w", err)
	}
	logger.InfoContext(ctx, "simulation ended", "accepted", stats.Accepted,
		"rejected", stats.Rejected, "failed_actions", stats.FailedActions,
		"dead_bots", stats.DeadBots, "mean_latency", stats.MeanLatency,
		"max_latency", stats.MaxLatency)
	return nil
}
