package store

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
)

const tokenBytes = 32

// generateToken creates a random token.
func generateToken() string {
	raw := make([]byte, tokenBytes)
	// crypto/rand.Read never returns an error and aborts the program itself on failure.
	_, _ = rand.Read(raw)
	return base64.RawURLEncoding.EncodeToString(raw)
}

// hashSecret returns the SHA-256 hash of a secret as hex text.
func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

// matchSecret compares a secret with a stored hash in constant time.
func matchSecret(storedHash, secret string) bool {
	return subtle.ConstantTimeCompare([]byte(storedHash), []byte(hashSecret(secret))) == 1
}
