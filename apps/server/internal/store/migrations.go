package store

import (
	"context"
	"embed"
	"fmt"
	"io/fs"

	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// applyMigrations runs all pending goose migrations, limited only by the app context.
func (store *Store) applyMigrations(ctx context.Context) error {
	migrations, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return fmt.Errorf("open migrations: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectSQLite3, store.writeDB, migrations)
	if err != nil {
		return fmt.Errorf("create migration provider: %w", err)
	}
	_, err = provider.Up(ctx)
	if err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return nil
}
