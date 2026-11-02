package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// NewLAN describes a LAN to create.
type NewLAN struct {
	Slug     string `json:"slug"`
	Name     string `json:"name"`
	Timezone string `json:"timezone"`
	JoinCode string `json:"join_code"`
	StartsAt int64  `json:"starts_at"`
	EndsAt   int64  `json:"ends_at"`

	Rules rules.Rules `json:"-"`
}

// LANSummary is a LAN as the admin page shows it.
type LANSummary struct {
	ID       int64       `json:"id"`
	Slug     string      `json:"slug"`
	Name     string      `json:"name"`
	Timezone string      `json:"timezone"`
	StartsAt int64       `json:"starts_at"`
	EndsAt   int64       `json:"ends_at"`
	Active   bool        `json:"active"`
	Rules    rules.Rules `json:"rules"`
}

// activeLAN is the running LAN with its rules.
type activeLAN struct {
	id           int64
	timezone     string
	joinCodeHash string
	gameRules    rules.Rules
}

// querier is what [sql.DB] and [sql.Tx] share for queries.
type querier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// CreateLAN creates a LAN. Periods must not overlap, so at most one LAN is active.
func (store *Store) CreateLAN(ctx context.Context, lan NewLAN) error {
	if lan.Slug == "" || lan.Name == "" || lan.JoinCode == "" || lan.StartsAt >= lan.EndsAt {
		return ErrInvalidInput
	}
	rulesJSON, err := json.Marshal(lan.Rules)
	if err != nil {
		return fmt.Errorf("encode rules: %w", err)
	}
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		return insertLAN(ctx, transaction, lan, string(rulesJSON))
	})
}

// ListLANs returns all LANs, newest first.
func (store *Store) ListLANs(ctx context.Context, now int64) ([]LANSummary, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	rows, err := store.readDB.QueryContext(queryCtx, `SELECT id, slug, name, timezone, starts_at,
		ends_at, rules FROM lans ORDER BY starts_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list LANs: %w", err)
	}
	defer func() { _ = rows.Close() }()
	lans := []LANSummary{}
	for rows.Next() {
		var lan LANSummary
		var rulesJSON string
		err = rows.Scan(&lan.ID, &lan.Slug, &lan.Name, &lan.Timezone, &lan.StartsAt, &lan.EndsAt,
			&rulesJSON)
		if err != nil {
			return nil, fmt.Errorf("read LAN: %w", err)
		}
		lan.Rules, err = parseRules(rulesJSON)
		if err != nil {
			return nil, err
		}
		lan.Active = lan.StartsAt <= now && now < lan.EndsAt
		lans = append(lans, lan)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list LANs: %w", err)
	}
	return lans, nil
}

// UpdateLANRules replaces the rules of a LAN, also while it is running.
func (store *Store) UpdateLANRules(
	ctx context.Context, lanID int64, gameRules rules.Rules, now int64,
) error {
	err := rules.ValidateRules(gameRules)
	if err != nil {
		return fmt.Errorf("validate rules: %w", err)
	}
	rulesJSON, err := json.Marshal(gameRules)
	if err != nil {
		return fmt.Errorf("encode rules: %w", err)
	}
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		result, execErr := transaction.ExecContext(ctx,
			`UPDATE lans SET rules = ? WHERE id = ?`, string(rulesJSON), lanID)
		if execErr != nil {
			return fmt.Errorf("update rules: %w", execErr)
		}
		execErr = requireAffectedRow(result, ErrLANNotFound)
		if execErr != nil {
			return execErr
		}
		return recordAdminAction(ctx, transaction, AdminActionRules, lanID, now)
	})
}

// insertLAN writes the LAN if its period is free.
func insertLAN(ctx context.Context, transaction *sql.Tx, lan NewLAN, rulesJSON string) error {
	var overlapCount int
	const overlapQuery = `SELECT COUNT(*) FROM lans WHERE starts_at < ? AND ends_at > ?`
	err := transaction.QueryRowContext(ctx, overlapQuery, lan.EndsAt, lan.StartsAt).
		Scan(&overlapCount)
	if err != nil {
		return fmt.Errorf("check period: %w", err)
	}
	if overlapCount > 0 {
		return ErrLANOverlap
	}
	_, err = transaction.ExecContext(ctx, `INSERT INTO lans
		(slug, name, starts_at, ends_at, timezone, join_code_hash, rules)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		lan.Slug, lan.Name, lan.StartsAt, lan.EndsAt, lan.Timezone,
		hashSecret(lan.JoinCode), rulesJSON)
	if err != nil {
		return fmt.Errorf("insert LAN: %w", err)
	}
	return nil
}

// loadActiveLAN returns the LAN running at time `now`.
func loadActiveLAN(ctx context.Context, database querier, now int64) (activeLAN, error) {
	var lan activeLAN
	var rulesJSON string
	err := database.QueryRowContext(ctx, `SELECT id, timezone, join_code_hash, rules FROM lans
		WHERE starts_at <= ? AND ends_at > ?`, now, now).
		Scan(&lan.id, &lan.timezone, &lan.joinCodeHash, &rulesJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return activeLAN{}, ErrNoActiveLAN
	}
	if err != nil {
		return activeLAN{}, fmt.Errorf("load active LAN: %w", err)
	}
	lan.gameRules, err = parseRules(rulesJSON)
	if err != nil {
		return activeLAN{}, err
	}
	return lan, nil
}

// parseRules reads the rules of a LAN. Missing fields keep their default.
func parseRules(rulesJSON string) (rules.Rules, error) {
	gameRules := rules.DefaultRules()
	err := json.Unmarshal([]byte(rulesJSON), &gameRules)
	if err != nil {
		return rules.Rules{}, fmt.Errorf("parse rules: %w", err)
	}
	return gameRules, nil
}

// requireAffectedRow returns `missing` if a statement changed no row.
func requireAffectedRow(result sql.Result, missing error) error {
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read affected rows: %w", err)
	}
	if affected == 0 {
		return missing
	}
	return nil
}
