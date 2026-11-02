package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const commandCreateLAN = "create-lan"

var (
	errMissingOption = errors.New("-slug, -name and JELLY_JOIN_CODE are required")
	errInvalidPeriod = errors.New("-from must be before -to")
)

// runCreateLAN creates a LAN with the values from [rules.DefaultRules].
func runCreateLAN(ctx context.Context, arguments []string, logger *slog.Logger) error {
	lan, err := parseLANOptions(arguments)
	if err != nil {
		return err
	}
	database, err := openDatabase(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = database.Close() }()
	err = database.CreateLAN(ctx, lan)
	if err != nil {
		return fmt.Errorf("create LAN: %w", err)
	}
	logger.InfoContext(ctx, "LAN created", "slug", lan.Slug)
	return nil
}

// parseLANOptions reads the `create-lan` options. The join code comes from the environment, so
// it stays out of the process list and shell history.
func parseLANOptions(arguments []string) (store.NewLAN, error) {
	flags := flag.NewFlagSet(commandCreateLAN, flag.ContinueOnError)
	slug := flags.String("slug", "", "short name, for example ucb-2026")
	name := flags.String("name", "", "display name")
	from := flags.String("from", "", "start in RFC 3339, for example 2026-11-25T12:00:00+01:00")
	until := flags.String("to", "", "end in RFC 3339")
	timezone := flags.String("timezone", "Europe/Berlin", "time zone of the LAN")
	err := flags.Parse(arguments)
	if err != nil {
		return store.NewLAN{}, fmt.Errorf("parse options: %w", err)
	}
	joinCode := os.Getenv("JELLY_JOIN_CODE")
	if *slug == "" || *name == "" || joinCode == "" {
		return store.NewLAN{}, errMissingOption
	}
	_, err = time.LoadLocation(*timezone)
	if err != nil {
		return store.NewLAN{}, fmt.Errorf("parse time zone: %w", err)
	}
	startsAt, err := time.Parse(time.RFC3339, *from)
	if err != nil {
		return store.NewLAN{}, fmt.Errorf("parse -from: %w", err)
	}
	endsAt, err := time.Parse(time.RFC3339, *until)
	if err != nil {
		return store.NewLAN{}, fmt.Errorf("parse -to: %w", err)
	}
	if !startsAt.Before(endsAt) {
		return store.NewLAN{}, errInvalidPeriod
	}
	return store.NewLAN{
		Slug: *slug, Name: *name, Timezone: *timezone, JoinCode: joinCode,
		StartsAt: startsAt.UnixMilli(), EndsAt: endsAt.UnixMilli(), Rules: rules.DefaultRules(),
	}, nil
}
