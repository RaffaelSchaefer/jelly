package store_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/pressly/goose/v3"
)

// The last migration before the players table allowed lime.
const versionBeforeLime = 21

// The lime migration rebuilds players. With foreign keys on, dropping the old table would cascade
// into every table that points at players, so their rows must survive the rebuild.
func TestLimeMigrationKeepsPlayersAndTheirRows(t *testing.T) {
	database, provider := openMigrations(t)
	if _, err := provider.UpTo(t.Context(), versionBeforeLime); err != nil {
		t.Fatalf("up to %d: %v", versionBeforeLime, err)
	}
	execAll(
		t,
		database,
		`INSERT INTO lans (id, slug, name, starts_at, ends_at, timezone, join_code_hash, rules)
			VALUES (1, 'lan', 'LAN', 0, 10, 'UTC', 'hash', '{}')`,
		`INSERT INTO players (id, token_hash, name, name_key, color, created_at)
			VALUES (7, 'token-7', 'Glibber', 'glibber', 'peach', 1),
			(9, 'token-9', 'Weg', 'weg', 'mint', 1)`,
		`DELETE FROM players WHERE id = 9`,
		`INSERT INTO lan_entries (lan_id, player_id, joined_at) VALUES (1, 7, 1)`,
		`INSERT INTO xp_log (lan_id, player_id, action, xp, created_at)
			VALUES (1, 7, 'poke', 5, 1)`,
		`INSERT INTO purchases (player_id, cosmetic_key, price, created_at)
			VALUES (7, 'sprout', 2, 1)`,
	)
	if _, err := provider.Up(t.Context()); err != nil {
		t.Fatalf("up: %v", err)
	}
	for _, table := range []string{"players", "lan_entries", "xp_log", "purchases"} {
		if count := countRows(t, database, table); count != 1 {
			t.Errorf("%s has %d rows, want 1", table, count)
		}
	}
	checkLimePlayers(t, database)
}

// checkLimePlayers expects lime to be allowed, unknown colors refused, ids never reused and
// foreign keys back on.
func checkLimePlayers(t *testing.T, database *sql.DB) {
	t.Helper()
	execAll(t, database, `UPDATE players SET color = 'lime' WHERE id = 7`)
	if _, err := database.ExecContext(t.Context(),
		`UPDATE players SET color = 'red' WHERE id = 7`); err == nil {
		t.Error("the color red was accepted")
	}
	var playerID int64
	err := database.QueryRowContext(t.Context(),
		`INSERT INTO players (token_hash, name, name_key, color, created_at)
			VALUES ('token-new', 'Neu', 'neu', 'lime', 2) RETURNING id`).Scan(&playerID)
	if err != nil || playerID != 10 {
		t.Errorf("new player id = %d, %v, want 10", playerID, err)
	}
	var foreignKeys int
	err = database.QueryRowContext(t.Context(), `PRAGMA foreign_keys`).Scan(&foreignKeys)
	if err != nil || foreignKeys != 1 {
		t.Errorf("foreign_keys = %d, %v, want 1", foreignKeys, err)
	}
}

// The last migration before the players table allowed the colors of colorable cosmetics.
const versionBeforeMoreColors = 22

// The rebuild for the new colors must keep the rows that point at players, and rolling it back
// turns each new color into its nearest old one.
func TestMoreColorsMigrationKeepsRowsAndRollsBack(t *testing.T) {
	database, provider := openMigrations(t)
	if _, err := provider.UpTo(t.Context(), versionBeforeMoreColors); err != nil {
		t.Fatalf("up to %d: %v", versionBeforeMoreColors, err)
	}
	execAll(
		t,
		database,
		`INSERT INTO players (id, token_hash, name, name_key, color, created_at)
			VALUES (7, 'token-7', 'Glibber', 'glibber', 'lime', 1)`,
		`INSERT INTO purchases (player_id, cosmetic_key, price, created_at)
			VALUES (7, 'sprout', 2, 1)`,
	)
	if _, err := provider.UpTo(t.Context(), versionBeforeMoreColors+1); err != nil {
		t.Fatalf("up: %v", err)
	}
	if count := countRows(t, database, "purchases"); count != 1 {
		t.Errorf("purchases has %d rows, want 1", count)
	}
	execAll(t, database, `UPDATE players SET color = 'cherry' WHERE id = 7`)
	if _, err := provider.DownTo(t.Context(), versionBeforeMoreColors); err != nil {
		t.Fatalf("down: %v", err)
	}
	var color string
	err := database.QueryRowContext(t.Context(),
		`SELECT color FROM players WHERE id = 7`).Scan(&color)
	if err != nil || color != "peach" {
		t.Errorf("color after rollback = %q, %v, want peach", color, err)
	}
	if count := countRows(t, database, "purchases"); count != 1 {
		t.Errorf("purchases has %d rows after rollback, want 1", count)
	}
}

// openMigrations opens an empty database with foreign keys on and a goose provider for it.
func openMigrations(t *testing.T) (*sql.DB, *goose.Provider) {
	t.Helper()
	database, err := sql.Open("sqlite", "file:"+filepath.Join(t.TempDir(), "jelly.db")+
		"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	// Like the store's write pool, which runs the migrations.
	database.SetMaxOpenConns(1)
	provider, err := goose.NewProvider(goose.DialectSQLite3, database, os.DirFS("migrations"))
	if err != nil {
		t.Fatal(err)
	}
	return database, provider
}

// execAll runs each statement and stops the test at the first error.
func execAll(t *testing.T, database *sql.DB, statements ...string) {
	t.Helper()
	for _, statement := range statements {
		if _, err := database.ExecContext(t.Context(), statement); err != nil {
			t.Fatalf("%s: %v", statement, err)
		}
	}
}

// countRows counts the rows of a table.
func countRows(t *testing.T, database *sql.DB, table string) int {
	t.Helper()
	var count int
	err := database.QueryRowContext(t.Context(), "SELECT COUNT(*) FROM "+table).Scan(&count)
	if err != nil {
		t.Fatal(err)
	}
	return count
}
