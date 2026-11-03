package store

import "errors"

// Errors the API turns into its own error codes for the client.
var (
	// ErrInvalidCode reports a wrong join code.
	ErrInvalidCode = errors.New("invalid join code")
	// ErrNameTaken reports a name that is already in use.
	ErrNameTaken = errors.New("name is taken")
	// ErrNoActiveLAN reports that no LAN is running.
	ErrNoActiveLAN = errors.New("no active LAN")
	// ErrNotJoined reports an account that has not joined the current LAN.
	ErrNotJoined = errors.New("player has not joined the current LAN")
	// ErrAlreadyJoined reports an account that has already joined the current LAN.
	ErrAlreadyJoined = errors.New("player has already joined the current LAN")
	// ErrUnauthorized reports an unknown token.
	ErrUnauthorized = errors.New("unknown token")
	// ErrLANOverlap reports a LAN whose period overlaps another one.
	ErrLANOverlap = errors.New("period overlaps another LAN")
	// ErrLANNotFound reports an unknown LAN.
	ErrLANNotFound = errors.New("LAN not found")
	// ErrPlayerNotFound reports an unknown player.
	ErrPlayerNotFound = errors.New("player not found")
	// ErrCosmeticLocked reports a cosmetic the player has not unlocked.
	ErrCosmeticLocked = errors.New("cosmetic is locked")
	// ErrEventCodeInvalid reports an unknown or expired event code.
	ErrEventCodeInvalid = errors.New("invalid event code")
	// ErrEventCodeRedeemed reports an event code this player has already redeemed.
	ErrEventCodeRedeemed = errors.New("event code already redeemed")
	// ErrEventCodeExists reports an event code that already exists in this LAN.
	ErrEventCodeExists = errors.New("event code already exists")
	// ErrEmoteCooldown reports an emote sent too soon after the last one.
	ErrEmoteCooldown = errors.New("emote is on cooldown")
	// ErrInvalidFollow reports a jelly that cannot be followed.
	ErrInvalidFollow = errors.New("cannot stand next to this jelly")
	// ErrAreaNotFound reports an area that is not part of this LAN.
	ErrAreaNotFound = errors.New("area not found")
	// ErrAreaNotAssignable reports an area such as a desk, where no jelly can stand.
	ErrAreaNotAssignable = errors.New("no jelly can stand in this area")
	// ErrPartnerCodeInvalid reports an unknown or expired partner emote code.
	ErrPartnerCodeInvalid = errors.New("invalid partner code")
	// ErrPartnerSelf reports someone entering their own partner emote code.
	ErrPartnerSelf = errors.New("cannot be your own partner")
	// ErrPartnerCodesBusy reports that no free partner code was found.
	ErrPartnerCodesBusy = errors.New("no free partner code")
	// ErrInvalidInput reports admin input that is empty or inconsistent.
	ErrInvalidInput = errors.New("invalid input")
)
