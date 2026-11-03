package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const (
	millisPerSecond = 1000
	actionPartner   = "partner"

	// The states of a partner emote invite. Only a pending one can change.
	invitePending   = "pending"
	inviteAccepted  = "accepted"
	inviteDeclined  = "declined"
	inviteCancelled = "cancelled"
	// Only a list of one partner works so far. Group emotes will raise this limit.
	maxInvitedPartners = 1
)

// PartnerInvite asks other jellies for a partner emote.
type PartnerInvite struct {
	ID         int64   `json:"id"`
	EmoteKey   string  `json:"key"`
	FromID     int64   `json:"from_id"`
	PartnerIDs []int64 `json:"partner_ids"`
	State      string  `json:"state"`
	ExpiresAt  int64   `json:"expires_at"`
}

// PartnerInviteResult is an invite after a change, with the XP that change earned.
type PartnerInviteResult struct {
	PartnerEmote PartnerInvite `json:"partner_emote"`
	XPGained     int           `json:"xp_gained"`
	Me           PlayerState   `json:"me"`
}

// PartnerInviteList holds the open invites of a player.
type PartnerInviteList struct {
	Items      []PartnerInvite `json:"items"`
	NextCursor *string         `json:"next_cursor"`
}

// NewPartnerInvite is a request for a partner emote.
type NewPartnerInvite struct {
	PlayerID   int64
	EmoteKey   string
	PartnerIDs []int64
	Now        int64
	// IsNear says whether the partner stands within this distance of the player.
	IsNear func(partnerID int64, reach float64) bool
}

// CreatePartnerInvite asks another jelly for a partner emote.
func (store *Store) CreatePartnerInvite(
	ctx context.Context, request NewPartnerInvite,
) (PartnerInviteResult, error) {
	err := rules.ValidatePartnerEmote(request.EmoteKey)
	if err != nil {
		return PartnerInviteResult{}, fmt.Errorf("validate partner emote: %w", err)
	}
	if len(request.PartnerIDs) != maxInvitedPartners {
		return PartnerInviteResult{}, ErrInvalidPartner
	}
	var result PartnerInviteResult
	work := func(action actionContext) error {
		var workErr error
		result.PartnerEmote, workErr = insertPartnerInvite(ctx, action, request)
		return workErr
	}
	result.Me, err = store.runPlayerAction(ctx, request.PlayerID, request.Now, false, work)
	if err != nil {
		return PartnerInviteResult{}, err
	}
	return result, nil
}

// insertPartnerInvite checks the partner and writes the invite. One open invite per pair is enough.
func insertPartnerInvite(
	ctx context.Context, action actionContext, request NewPartnerInvite,
) (PartnerInvite, error) {
	partnerID := request.PartnerIDs[0]
	if partnerID == action.playerID {
		return PartnerInvite{}, ErrPartnerSelf
	}
	err := requireLANEntry(ctx, action.transaction, action.lan.id, partnerID)
	if errors.Is(err, ErrNotJoined) {
		return PartnerInvite{}, ErrInvalidPartner
	}
	if err != nil {
		return PartnerInvite{}, err
	}
	if !request.IsNear(partnerID, action.lan.gameRules.NearDistance) {
		return PartnerInvite{}, ErrTooFar
	}
	var found int
	const findOpenInviteSQL = `SELECT 1 FROM partner_invites
		WHERE lan_id = ? AND state = ? AND from_id = ? AND to_id = ? AND expires_at > ?`
	err = action.transaction.QueryRowContext(ctx, findOpenInviteSQL, action.lan.id, invitePending,
		action.playerID, partnerID, action.now).Scan(&found)
	if err == nil {
		return PartnerInvite{}, ErrInviteOpen
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return PartnerInvite{}, fmt.Errorf("find open invite: %w", err)
	}
	invite := PartnerInvite{
		ID: 0, EmoteKey: request.EmoteKey, FromID: action.playerID, PartnerIDs: []int64{partnerID},
		State:     invitePending,
		ExpiresAt: action.now + action.lan.gameRules.PartnerInviteSeconds*millisPerSecond,
	}
	const insertInviteSQL = `INSERT INTO partner_invites
		(lan_id, from_id, to_id, emote_key, state, expires_at) VALUES (?, ?, ?, ?, ?, ?)`
	inserted, err := action.transaction.ExecContext(ctx, insertInviteSQL, action.lan.id,
		invite.FromID, partnerID, invite.EmoteKey, invite.State, invite.ExpiresAt)
	if err != nil {
		return PartnerInvite{}, fmt.Errorf("insert invite: %w", err)
	}
	invite.ID, err = inserted.LastInsertId()
	if err != nil {
		return PartnerInvite{}, fmt.Errorf("read invite ID: %w", err)
	}
	return invite, appendVisibleEvent(ctx, action, EventPartnerInvite, invite)
}

// AnswerPartnerInvite accepts, declines or cancels an invite. Only the invited jelly can accept or
// decline, and only the one who asked can cancel.
func (store *Store) AnswerPartnerInvite(
	ctx context.Context, playerID, inviteID int64, state string, now int64,
) (PartnerInviteResult, error) {
	var result PartnerInviteResult
	work := func(action actionContext) error {
		invite, workErr := loadAnswerableInvite(ctx, action, inviteID, state)
		if workErr != nil {
			return workErr
		}
		invite.State = state
		result.PartnerEmote = invite
		const updateInviteSQL = `UPDATE partner_invites SET state = ? WHERE id = ?`
		_, workErr = action.transaction.ExecContext(ctx, updateInviteSQL, state, inviteID)
		if workErr != nil {
			return fmt.Errorf("update invite: %w", workErr)
		}
		workErr = appendVisibleEvent(ctx, action, EventPartnerInvite, invite)
		if workErr != nil || state != inviteAccepted {
			return workErr
		}
		result.XPGained, workErr = playAcceptedEmote(ctx, action, invite)
		return workErr
	}
	var err error
	result.Me, err = store.runPlayerAction(ctx, playerID, now, false, work)
	if err != nil {
		return PartnerInviteResult{}, err
	}
	return result, nil
}

// loadAnswerableInvite returns an invite if this player may give it this answer now.
func loadAnswerableInvite(
	ctx context.Context, action actionContext, inviteID int64, state string,
) (PartnerInvite, error) {
	invite := PartnerInvite{ID: inviteID, PartnerIDs: []int64{0}}
	const selectInviteSQL = `SELECT emote_key, from_id, to_id, state, expires_at
		FROM partner_invites WHERE id = ? AND lan_id = ?`
	err := action.transaction.QueryRowContext(ctx, selectInviteSQL, inviteID, action.lan.id).Scan(
		&invite.EmoteKey, &invite.FromID, &invite.PartnerIDs[0], &invite.State, &invite.ExpiresAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return PartnerInvite{}, ErrInviteNotFound
	}
	if err != nil {
		return PartnerInvite{}, fmt.Errorf("load invite: %w", err)
	}
	isInvited := invite.PartnerIDs[0] == action.playerID
	if !isInvited && invite.FromID != action.playerID {
		return PartnerInvite{}, ErrInviteNotFound
	}
	isAllowed := (isInvited && (state == inviteAccepted || state == inviteDeclined)) ||
		(!isInvited && state == inviteCancelled)
	if !isAllowed {
		return PartnerInvite{}, ErrInvalidInviteAnswer
	}
	if invite.State != invitePending || invite.ExpiresAt <= action.now {
		return PartnerInvite{}, ErrInviteClosed
	}
	return invite, nil
}

// playAcceptedEmote plays the emote for both players and pays XP for a new partner.
func playAcceptedEmote(
	ctx context.Context, action actionContext, invite PartnerInvite,
) (int, error) {
	partner, err := loadOtherPlayerAction(ctx, action, invite.FromID)
	if err != nil {
		return 0, err
	}
	gainedXP, err := recordPartnerEmote(ctx, action, partner, invite.EmoteKey)
	if err != nil {
		return 0, err
	}
	return gainedXP, grantNewAchievements(ctx, action.transaction, achievementInput{
		lan: partner.lan, playerID: partner.playerID, now: partner.now,
		restHours: 0, sessionHours: 0, isPoke: false,
	})
}

// ListOpenPartnerInvites returns what a player can still answer, for example after a restart.
func (store *Store) ListOpenPartnerInvites(
	ctx context.Context, playerID, now int64,
) (PartnerInviteList, error) {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	list := PartnerInviteList{Items: []PartnerInvite{}, NextCursor: nil}
	const selectOpenInvitesSQL = `SELECT id, emote_key, from_id, to_id, state, expires_at
		FROM partner_invites
		WHERE state = ? AND expires_at > ? AND (from_id = ? OR to_id = ?) ORDER BY id`
	rows, err := store.readDB.QueryContext(queryCtx, selectOpenInvitesSQL,
		invitePending, now, playerID, playerID)
	if err != nil {
		return list, fmt.Errorf("load invites: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		invite := PartnerInvite{PartnerIDs: []int64{0}}
		err = rows.Scan(&invite.ID, &invite.EmoteKey, &invite.FromID, &invite.PartnerIDs[0],
			&invite.State, &invite.ExpiresAt)
		if err != nil {
			return list, fmt.Errorf("read invite: %w", err)
		}
		list.Items = append(list.Items, invite)
	}
	if err := rows.Err(); err != nil {
		return list, fmt.Errorf("load invites: %w", err)
	}
	return list, nil
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
