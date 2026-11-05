package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

const (
	// DefaultRecoverySeconds is how long a recovery code lasts unless the orga says otherwise.
	DefaultRecoverySeconds int64 = 24 * 60 * 60
	// A forgotten code stays a key to the account, so it cannot last forever.
	maxRecoverySeconds int64 = 30 * 24 * 60 * 60
)

// RecoveryCode is a new recovery code, shown to the admin only once.
type RecoveryCode struct {
	Code      string `json:"code"`
	ExpiresAt int64  `json:"expires_at"`
}

// CreateRecoveryCode gives an account a code that replaces its secret and ends an older code. The
// old secret keeps working until the code is used, so a code alone locks nobody out.
func (store *Store) CreateRecoveryCode(
	ctx context.Context, playerID, validSeconds, now int64,
) (RecoveryCode, error) {
	if validSeconds <= 0 || validSeconds > maxRecoverySeconds {
		return RecoveryCode{}, ErrInvalidInput
	}
	recovery := RecoveryCode{
		Code: generateRecoveryCode(), ExpiresAt: now + validSeconds*millisPerSecond,
	}
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		workErr := requireAccount(ctx, transaction, playerID)
		if workErr != nil {
			return workErr
		}
		const replaceRecoveryCodeSQL = `INSERT OR REPLACE INTO recovery_codes
			(player_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)`
		_, workErr = transaction.ExecContext(ctx, replaceRecoveryCodeSQL,
			playerID, hashSecret(recovery.Code), recovery.ExpiresAt, now)
		if workErr != nil {
			return fmt.Errorf("write recovery code: %w", workErr)
		}
		return recordAdminAction(ctx, transaction, AdminActionRecovery, playerID, now)
	})
	if err != nil {
		return RecoveryCode{}, err
	}
	return recovery, nil
}

// RecoverAccount exchanges a recovery code for a new secret. The old secret stops working and the
// code is used up. It changes nothing about LANs or seats.
func (store *Store) RecoverAccount(
	ctx context.Context, code string, now int64,
) (string, PlayerState, error) {
	secret := generateToken()
	var state PlayerState
	err := store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		playerID, workErr := useRecoveryCode(ctx, transaction, code, now)
		if workErr != nil {
			return workErr
		}
		const updateSecretSQL = `UPDATE players SET token_hash = ? WHERE id = ?`
		_, workErr = transaction.ExecContext(ctx, updateSecretSQL, hashSecret(secret), playerID)
		if workErr != nil {
			return fmt.Errorf("replace secret: %w", workErr)
		}
		state, workErr = loadState(ctx, transaction, playerID, now)
		return workErr
	})
	if err != nil {
		return "", PlayerState{}, err
	}
	return secret, state, nil
}

// useRecoveryCode removes a valid code and returns its account.
func useRecoveryCode(
	ctx context.Context, transaction *sql.Tx, code string, now int64,
) (int64, error) {
	var playerID int64
	const deleteRecoveryCodeSQL = `DELETE FROM recovery_codes
		WHERE code_hash = ? AND expires_at > ? RETURNING player_id`
	err := transaction.QueryRowContext(ctx, deleteRecoveryCodeSQL,
		hashSecret(normalizeSeatCode(code)), now).Scan(&playerID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrInvalidRecoveryCode
	}
	if err != nil {
		return 0, fmt.Errorf("use recovery code: %w", err)
	}
	return playerID, nil
}
