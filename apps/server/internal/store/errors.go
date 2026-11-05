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
	// ErrCodeRedeemed reports a seat code that was already used.
	ErrCodeRedeemed = errors.New("seat code was already redeemed")
	// ErrGatheringNotFound reports that no gathering is running.
	ErrGatheringNotFound = errors.New("no gathering is running")
	// ErrSeatCodeOtherAccount reports a seat code that belongs to a different account.
	ErrSeatCodeOtherAccount = errors.New("seat code belongs to another account")
	// ErrInvalidRecoveryCode reports a recovery code that is unknown, used up or too old.
	ErrInvalidRecoveryCode = errors.New("invalid recovery code")
	// ErrUnauthorized reports an unknown token.
	ErrUnauthorized = errors.New("unknown token")
	// ErrLevelsLocked reports a new XP per level after the start of a LAN.
	ErrLevelsLocked = errors.New("XP per level is locked")
	// ErrLANSlugTaken reports a short name that another LAN already has.
	ErrLANSlugTaken = errors.New("short name of the LAN is taken")
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
	// ErrInvalidTrip reports a trip to a point outside the stage or inside a zone that blocks.
	ErrInvalidTrip = errors.New("no jelly can stand on this point")
	// ErrTooFar reports two jellies that do not stand next to each other.
	ErrTooFar = errors.New("jellies are too far apart")
	// ErrStackNotFound reports a stack that does not exist or has fallen apart.
	ErrStackNotFound = errors.New("stack not found")
	// ErrStackFull reports a stack that reached its height.
	ErrStackFull = errors.New("stack is full")
	// ErrInvalidHighlight reports a jelly that cannot be highlighted.
	ErrInvalidHighlight = errors.New("cannot highlight this jelly")
	// ErrHighlightCooldown reports a highlight sent too soon after the last one.
	ErrHighlightCooldown = errors.New("highlight is on cooldown")
	// ErrAreaNotFound reports an area that is not part of this LAN.
	ErrAreaNotFound = errors.New("area not found")
	// ErrAreaNotAssignable reports an area such as a desk, where no jelly can stand.
	ErrAreaNotAssignable = errors.New("no jelly can stand in this area")
	// ErrPartnerSelf reports someone inviting themselves to a partner emote.
	ErrPartnerSelf = errors.New("cannot be your own partner")
	// ErrInvalidPartner reports a partner list that is not one jelly of this LAN.
	ErrInvalidPartner = errors.New("invalid partner")
	// ErrInviteOpen reports that this pair already has an open invite.
	ErrInviteOpen = errors.New("invite is already open")
	// ErrInviteNotFound reports an invite that does not exist or concerns someone else.
	ErrInviteNotFound = errors.New("invite not found")
	// ErrInviteClosed reports an invite that was answered or has expired.
	ErrInviteClosed = errors.New("invite is closed")
	// ErrInvalidInviteAnswer reports an answer this player cannot give to this invite.
	ErrInvalidInviteAnswer = errors.New("invalid invite answer")
	// ErrLANFull reports that a LAN reached its player limit.
	ErrLANFull = errors.New("LAN is full")
	// ErrInvalidInput reports admin input that is empty or inconsistent.
	ErrInvalidInput = errors.New("invalid input")
)
