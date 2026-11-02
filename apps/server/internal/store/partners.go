package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const (
	partnerCodeRange    = 10_000
	partnerCodeFormat   = "%04d"
	partnerCodeAttempts = 20
	millisPerSecond     = 1000
	actionPartner       = "partner"
)

// PartnerOffer is a spoken code that another player can enter.
type PartnerOffer struct {
	Code      string `json:"code"`
	EmoteKey  string `json:"key"`
	ExpiresAt int64  `json:"expires_at"`
}

// PartnerResult is the outcome of entering a partner code.
type PartnerResult struct {
	EmoteKey  string `json:"key"`
	PartnerID int64  `json:"partner_id"`
	XPGained  int    `json:"xp_gained"`
	State     State  `json:"me"`
}

// CreatePartnerOffer starts a partner emote and replaces an older code of this player.
func (store *Store) CreatePartnerOffer(
	ctx context.Context, playerID int64, emoteKey string, now int64,
) (PartnerOffer, error) {
	err := rules.ValidatePartnerEmote(emoteKey)
	if err != nil {
		return PartnerOffer{}, fmt.Errorf("validate partner emote: %w", err)
	}
	var offer PartnerOffer
	_, err = store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		var workErr error
		offer, workErr = insertPartnerOffer(ctx, action, emoteKey)
		return workErr
	})
	if err != nil {
		return PartnerOffer{}, err
	}
	return offer, nil
}

// AcceptPartnerOffer plays the emote for both players and pays XP for a new partner.
func (store *Store) AcceptPartnerOffer(
	ctx context.Context, playerID int64, code string, now int64,
) (PartnerResult, error) {
	var result PartnerResult
	work := func(action actionContext) error {
		var workErr error
		result, workErr = applyPartnerOffer(ctx, action, strings.TrimSpace(code))
		return workErr
	}
	state, err := store.runPlayerAction(ctx, playerID, now, false, work)
	if err != nil {
		return PartnerResult{}, err
	}
	result.State = state
	return result, nil
}

// insertPartnerOffer removes expired and own codes, so codes stay free for others.
func insertPartnerOffer(
	ctx context.Context, action actionContext, emoteKey string,
) (PartnerOffer, error) {
	const deleteStaleOffersSQL = `DELETE FROM partner_offers
		WHERE lan_id = ? AND (expires_at <= ? OR player_id = ?)`
	_, err := action.transaction.ExecContext(ctx, deleteStaleOffersSQL,
		action.lan.id, action.now, action.playerID)
	if err != nil {
		return PartnerOffer{}, fmt.Errorf("delete partner offers: %w", err)
	}
	code, err := findFreePartnerCode(ctx, action)
	if err != nil {
		return PartnerOffer{}, err
	}
	offer := PartnerOffer{
		Code: code, EmoteKey: emoteKey,
		ExpiresAt: action.now + action.lan.gameRules.PartnerCodeSeconds*millisPerSecond,
	}
	const insertOfferSQL = `INSERT INTO partner_offers
		(lan_id, player_id, code, emote_key, expires_at) VALUES (?, ?, ?, ?, ?)`
	_, err = action.transaction.ExecContext(ctx, insertOfferSQL,
		action.lan.id, action.playerID, offer.Code, offer.EmoteKey, offer.ExpiresAt)
	if err != nil {
		return PartnerOffer{}, fmt.Errorf("insert partner offer: %w", err)
	}
	return offer, nil
}

// findFreePartnerCode picks a random code that nobody in this LAN is using.
func findFreePartnerCode(ctx context.Context, action actionContext) (string, error) {
	for range partnerCodeAttempts {
		number, err := rand.Int(rand.Reader, big.NewInt(partnerCodeRange))
		if err != nil {
			return "", fmt.Errorf("generate partner code: %w", err)
		}
		code := fmt.Sprintf(partnerCodeFormat, number.Int64())
		var found int
		const findUsedCodeSQL = `SELECT 1 FROM partner_offers WHERE lan_id = ? AND code = ?`
		err = action.transaction.QueryRowContext(ctx, findUsedCodeSQL,
			action.lan.id, code).Scan(&found)
		if errors.Is(err, sql.ErrNoRows) {
			return code, nil
		}
		if err != nil {
			return "", fmt.Errorf("check partner code: %w", err)
		}
	}
	return "", ErrPartnerCodesBusy
}

// applyPartnerOffer uses up a code and updates both players.
func applyPartnerOffer(
	ctx context.Context, action actionContext, code string,
) (PartnerResult, error) {
	var result PartnerResult
	const findValidOfferSQL = `SELECT player_id, emote_key FROM partner_offers
		WHERE lan_id = ? AND code = ? AND expires_at > ?`
	err := action.transaction.QueryRowContext(ctx, findValidOfferSQL,
		action.lan.id, code, action.now).
		Scan(&result.PartnerID, &result.EmoteKey)
	if errors.Is(err, sql.ErrNoRows) {
		return PartnerResult{}, ErrPartnerCodeInvalid
	}
	if err != nil {
		return PartnerResult{}, fmt.Errorf("find partner offer: %w", err)
	}
	if result.PartnerID == action.playerID {
		return PartnerResult{}, ErrPartnerSelf
	}
	const deleteUsedOfferSQL = `DELETE FROM partner_offers WHERE lan_id = ? AND code = ?`
	_, err = action.transaction.ExecContext(ctx, deleteUsedOfferSQL, action.lan.id, code)
	if err != nil {
		return PartnerResult{}, fmt.Errorf("use partner offer: %w", err)
	}
	partner, err := loadOtherPlayerAction(ctx, action, result.PartnerID)
	if err != nil {
		return PartnerResult{}, err
	}
	result.XPGained, err = recordPartnerEmote(ctx, action, partner, result.EmoteKey)
	if err != nil {
		return PartnerResult{}, err
	}
	err = grantNewAchievements(ctx, action.transaction, achievementInput{
		lan: partner.lan, playerID: partner.playerID, now: partner.now,
		restHours: 0, sessionHours: 0, isPoke: false,
	})
	if err != nil {
		return PartnerResult{}, err
	}
	return result, nil
}

// recordPartnerEmote writes the history and event, and pays both players for a new partner.
func recordPartnerEmote(
	ctx context.Context, action, partner actionContext, emoteKey string,
) (int, error) {
	gainedXP := 0
	isNew, err := isNewPartner(ctx, action, partner.playerID)
	if err != nil {
		return 0, err
	}
	if isNew {
		gainedXP = action.lan.gameRules.PartnerXP
	}
	for _, pair := range [][2]actionContext{{action, partner}, {partner, action}} {
		const insertPartnerEmoteSQL = `INSERT INTO partner_emotes
			(lan_id, player_id, partner_id, emote_key, created_at) VALUES (?, ?, ?, ?, ?)`
		_, err = action.transaction.ExecContext(ctx, insertPartnerEmoteSQL,
			action.lan.id, pair[0].playerID, pair[1].playerID, emoteKey, action.now)
		if err != nil {
			return 0, fmt.Errorf("write partner emote: %w", err)
		}
		if gainedXP > 0 {
			err = grantXP(ctx, pair[0], xpEntry{action: actionPartner, amount: gainedXP})
			if err != nil {
				return 0, err
			}
		}
	}
	if action.hidden || partner.hidden {
		return gainedXP, nil
	}
	payload := map[string]any{payloadKey: emoteKey, "partner_id": partner.playerID}
	return gainedXP, appendVisibleEvent(ctx, action, EventPartnerEmote, payload)
}

// isNewPartner reports whether these two players had no partner emote yet in this LAN.
func isNewPartner(ctx context.Context, action actionContext, partnerID int64) (bool, error) {
	var count int
	const countPartnerEmotesSQL = `SELECT COUNT(*) FROM partner_emotes
		WHERE lan_id = ? AND player_id = ? AND partner_id = ?`
	err := action.transaction.QueryRowContext(ctx, countPartnerEmotesSQL,
		action.lan.id, action.playerID, partnerID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("check partner: %w", err)
	}
	return count == 0, nil
}
