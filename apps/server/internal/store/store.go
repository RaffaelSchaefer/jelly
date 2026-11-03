// Package store wraps the SQLite database of the server.
//
// Writes use exactly one connection, reads use their own pool.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"time"

	// Registers the SQLite driver without CGO.
	_ "modernc.org/sqlite"
)

const (
	maxReadConnections = 4
	queryTimeout       = 5 * time.Second
	transactionTimeout = 5 * time.Second
)

// Store is the access to the database.
type Store struct {
	writeDB *sql.DB
	readDB  *sql.DB
}

// Open opens the database at `path` and applies pending migrations.
func Open(ctx context.Context, path string) (*Store, error) {
	location := (&url.URL{Path: path}).EscapedPath()
	baseDSN := "file:" + location + "?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"

	writeDB, err := openPool(baseDSN+"&_pragma=journal_mode(WAL)&_txlock=immediate", 1)
	if err != nil {
		return nil, err
	}
	store := &Store{writeDB: writeDB, readDB: nil}
	err = store.applyMigrations(ctx)
	if err != nil {
		return nil, errors.Join(err, writeDB.Close())
	}
	readDB, err := openPool(baseDSN+"&_pragma=query_only(1)", maxReadConnections)
	if err != nil {
		return nil, errors.Join(err, writeDB.Close())
	}
	store.readDB = readDB
	return store, nil
}

// Close closes both connection pools.
func (store *Store) Close() error {
	return errors.Join(store.readDB.Close(), store.writeDB.Close())
}

// PingDatabase checks that the database is readable.
func (store *Store) PingDatabase(ctx context.Context) error {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	err := store.readDB.PingContext(queryCtx)
	if err != nil {
		return fmt.Errorf("ping database: %w", err)
	}
	return nil
}

// runInTransaction runs `work` in a write transaction with a time limit.
func (store *Store) runInTransaction(ctx context.Context, work func(*sql.Tx) error) error {
	transactionCtx, cancel := context.WithTimeout(ctx, transactionTimeout)
	defer cancel()
	transaction, err := store.writeDB.BeginTx(transactionCtx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = transaction.Rollback() }()
	err = work(transaction)
	if err != nil {
		return err
	}
	err = transaction.Commit()
	if err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}

// withQueryTimeout derives the context for one read operation.
func withQueryTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, queryTimeout)
}

// openPool opens a connection pool with a fixed limit.
func openPool(dsn string, maxConnections int) (*sql.DB, error) {
	pool, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	pool.SetMaxOpenConns(maxConnections)
	return pool, nil
}
