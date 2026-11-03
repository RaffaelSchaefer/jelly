package store

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
)

const (
	tokenBytes     = 32
	seatCodeLength = 8
	// Without letters and digits that look alike, because people type the code from a note.
	seatCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
)

// generateToken creates a random token.
func generateToken() string {
	raw := make([]byte, tokenBytes)
	// crypto/rand.Read never returns an error and aborts the program itself on failure.
	_, _ = rand.Read(raw)
	return base64.RawURLEncoding.EncodeToString(raw)
}

// generateSeatCode creates a code that is short enough to type. Attempts are rate limited.
func generateSeatCode() string {
	raw := make([]byte, seatCodeLength)
	// crypto/rand.Read never returns an error and aborts the program itself on failure.
	_, _ = rand.Read(raw)
	code := make([]byte, seatCodeLength)
	for index, value := range raw {
		code[index] = seatCodeAlphabet[int(value)%len(seatCodeAlphabet)]
	}
	return string(code)
}

// hashSecret returns the SHA-256 hash of a secret as hex text.
func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}
