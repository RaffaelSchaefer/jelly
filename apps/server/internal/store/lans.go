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

// LANPeriod says when a LAN runs.
type LANPeriod struct {
	Slug     string `json:"slug"`
	Name     string `json:"name"`
	StartsAt int64  `json:"starts_at"`
	EndsAt   int64  `json:"ends_at"`
}

// LANStatus says which LAN runs and comes next, the response of `GET /lans/current`.
type LANStatus struct {
	ServerTime int64      `json:"server_time"`
	Current    *LANPeriod `json:"current"`
	Next       *LANPeriod `json:"next"`
	// Joined tells a logged-in player whether they take part in the running LAN.
	Joined *bool `json:"joined"`
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
	const selectLANsSQL = `SELECT id, slug, name, timezone, starts_at,
		ends_at, rules FROM lans ORDER BY starts_at DESC`
	rows, err := store.readDB.QueryContext(queryCtx, selectLANsSQL)
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
		const updateRulesSQL = `UPDATE lans SET rules = ? WHERE id = ?`
		result, execErr := transaction.ExecContext(ctx, updateRulesSQL, string(rulesJSON), lanID)
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

// UpdateJoinCode replaces the code of a LAN, for example after it reached the wrong people.
func (store *Store) UpdateJoinCode(
	ctx context.Context, lanID int64, joinCode string, now int64,
) error {
	if joinCode == "" {
		return ErrInvalidInput
	}
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		const updateJoinCodeSQL = `UPDATE lans SET join_code_hash = ? WHERE id = ?`
		result, err := transaction.ExecContext(ctx, updateJoinCodeSQL, hashSecret(joinCode), lanID)
		if err != nil {
			return fmt.Errorf("update join code: %w", err)
		}
		err = requireAffectedRow(result, ErrLANNotFound)
		if err != nil {
			return err
		}
		return recordAdminAction(ctx, transaction, AdminActionJoinCode, lanID, now)
	})
}

// LoadLANStatus returns the running and the next LAN. With a player ID above 0, it also says
// whether this player joined the running LAN.
func (store *Store) LoadLANStatus(ctx context.Context, playerID, now int64) (LANStatus, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	status := LANStatus{ServerTime: now, Current: nil, Next: nil, Joined: nil}
	const selectCurrentLANSQL = `SELECT id, slug, name, starts_at, ends_at FROM lans
		WHERE starts_at <= ?1 AND ends_at > ?1`
	currentID, current, err := loadLANPeriod(queryCtx, store.readDB, selectCurrentLANSQL, now)
	if err != nil {
		return LANStatus{}, err
	}
	status.Current = current
	const selectNextLANSQL = `SELECT id, slug, name, starts_at, ends_at FROM lans
		WHERE starts_at > ?1 ORDER BY starts_at LIMIT 1`
	_, status.Next, err = loadLANPeriod(queryCtx, store.readDB, selectNextLANSQL, now)
	if err != nil {
		return LANStatus{}, err
	}
	if current == nil || playerID <= 0 {
		return status, nil
	}
	err = requireLANEntry(queryCtx, store.readDB, currentID, playerID)
	if err != nil && !errors.Is(err, ErrNotJoined) {
		return LANStatus{}, err
	}
	joined := err == nil
	status.Joined = &joined
	return status, nil
}

// loadLANPeriod runs a query for one LAN and returns nil if there is none.
func loadLANPeriod(
	ctx context.Context, database querier, selectPeriodSQL string, now int64,
) (int64, *LANPeriod, error) {
	var lanID int64
	var period LANPeriod
	err := database.QueryRowContext(ctx, selectPeriodSQL, now).
		Scan(&lanID, &period.Slug, &period.Name, &period.StartsAt, &period.EndsAt)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil, nil
	}
	if err != nil {
		return 0, nil, fmt.Errorf("load LAN period: %w", err)
	}
	return lanID, &period, nil
}

// insertLAN writes the LAN if its period is free.
func insertLAN(ctx context.Context, transaction *sql.Tx, lan NewLAN, rulesJSON string) error {
	var overlapCount int
	const countOverlapsSQL = `SELECT COUNT(*) FROM lans WHERE starts_at < ? AND ends_at > ?`
	err := transaction.QueryRowContext(ctx, countOverlapsSQL, lan.EndsAt, lan.StartsAt).
		Scan(&overlapCount)
	if err != nil {
		return fmt.Errorf("check period: %w", err)
	}
	if overlapCount > 0 {
		return ErrLANOverlap
	}
	const insertLANSQL = `INSERT INTO lans
		(slug, name, starts_at, ends_at, timezone, join_code_hash, rules)
		VALUES (?, ?, ?, ?, ?, ?, ?)`
	_, err = transaction.ExecContext(ctx, insertLANSQL,
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
	const selectActiveLANSQL = `SELECT id, timezone, join_code_hash, rules FROM lans
		WHERE starts_at <= ? AND ends_at > ?`
	err := database.QueryRowContext(ctx, selectActiveLANSQL, now, now).
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
