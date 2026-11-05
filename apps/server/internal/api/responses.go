package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"slices"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const maxBodyBytes = 4 << 10

// Field names shared by several responses.
const (
	fieldCreated = "created"
	fieldDeleted = "deleted"
	fieldHidden  = "hidden"
	fieldSecret  = "secret"
	fieldUpdated = "updated"
)

// problem is an error response with a stable code. `message` is shown in the German app.
type problem struct {
	status  int
	code    string
	message string
}

// ErrorDetails is the content of the uniform error response.
type ErrorDetails struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ErrorResponse is the uniform error response.
type ErrorResponse struct {
	Error ErrorDetails `json:"error"`
}

// problemError is an error response that tells the API library its status.
type problemError struct {
	ErrorResponse

	status int
}

// GetStatus returns the HTTP status.
func (response *problemError) GetStatus() int {
	return response.status
}

// Error returns the stable code.
func (response *problemError) Error() string {
	return response.ErrorResponse.Error.Code
}

// toResponse turns a problem into its response.
func (answer problem) toResponse() *problemError {
	return &problemError{
		ErrorResponse: ErrorResponse{
			Error: ErrorDetails{Code: answer.code, Message: answer.message},
		},
		status: answer.status,
	}
}

// knownError maps an error to its error response.
type knownError struct {
	target error
	answer problem
}

// listKnownErrors returns all errors the client may learn about.
func listKnownErrors() []knownError {
	return slices.Concat(
		listPlayerErrors(), listSeatErrors(), listCosmeticErrors(), listInviteErrors(),
		listGameErrors(), listStackErrors(),
	)
}

// listPlayerErrors covers accounts, access and admin input.
func listPlayerErrors() []knownError {
	return []knownError{
		{store.ErrUnauthorized, problem{
			http.StatusUnauthorized, "unauthorized", "Dieses Konto ist nicht bekannt.",
		}},
		{errForbidden, problem{http.StatusForbidden, "forbidden", "Zugriff verweigert."}},
		{store.ErrInvalidCode, problem{
			http.StatusForbidden, "invalid_code", "Der Anmeldecode stimmt nicht.",
		}},
		{store.ErrNameTaken, problem{
			http.StatusConflict, "name_taken", "Dieser Name ist schon vergeben.",
		}},
		{store.ErrPlayerNotFound, problem{
			http.StatusNotFound, "player_not_found", "Dieses Konto gibt es nicht.",
		}},
		{store.ErrLANNotFound, problem{
			http.StatusNotFound, "lan_not_found", "Diese LAN gibt es nicht.",
		}},
		{store.ErrLANFull, problem{
			http.StatusConflict, "lan_full", "Diese LAN ist schon voll.",
		}},
		{store.ErrLANOverlap, problem{
			http.StatusConflict, "lan_overlap", "Der Zeitraum überschneidet sich mit einer LAN.",
		}},
		{store.ErrInvalidInput, problem{
			http.StatusBadRequest, "invalid_input", "Die Angaben sind unvollständig.",
		}},
		{store.ErrAreaNotFound, problem{
			http.StatusNotFound, "area_not_found", "Diesen Bereich gibt es nicht.",
		}},
		{store.ErrAreaNotAssignable, problem{
			http.StatusConflict, "area_not_assignable", "In diesem Bereich kann kein Jelly stehen.",
		}},
		{rules.ErrInvalidArea, problem{
			http.StatusBadRequest, "invalid_area",
			"Dieser Bereich passt nicht auf die Bühne oder hat keine bekannte Art.",
		}},
		{rules.ErrInvalidRules, problem{
			http.StatusBadRequest, "invalid_rules", "Diese Regeln sind ungültig.",
		}},
		{rules.ErrInvalidName, problem{
			http.StatusBadRequest, "invalid_name",
			"Der Name muss 1 bis 24 Zeichen lang sein und darf keine Steuerzeichen enthalten.",
		}},
		{rules.ErrInvalidColor, problem{
			http.StatusBadRequest, "invalid_color", "Diese Farbe gibt es nicht.",
		}},
	}
}

// listCosmeticErrors returns the errors of the cosmetic slots.
func listCosmeticErrors() []knownError {
	return []knownError{
		{rules.ErrUnknownSlot, problem{
			http.StatusBadRequest, "unknown_slot", "Diesen Platz für Cosmetics gibt es nicht.",
		}},
		{
			rules.ErrUnknownCosmetic,
			problem{
				http.StatusBadRequest,
				"unknown_cosmetic",
				"Dieses Cosmetic passt nicht auf diesen Platz.",
			},
		},
		{rules.ErrInvalidCosmeticColor, problem{
			http.StatusBadRequest, "invalid_cosmetic_color", "Diese Farbe geht hier nicht.",
		}},
		{store.ErrCosmeticLocked, problem{
			http.StatusConflict, "cosmetic_locked",
			"Dieses Cosmetic ist noch nicht freigeschaltet.",
		}},
	}
}

// listStackErrors returns the errors of stacks and highlights.
func listStackErrors() []knownError {
	return []knownError{
		{store.ErrStackNotFound, problem{
			http.StatusNotFound, "stack_not_found", "Diesen Stapel gibt es nicht mehr.",
		}},
		{store.ErrStackFull, problem{
			http.StatusConflict, "stack_full", "Dieser Stapel ist schon hoch genug.",
		}},
		{store.ErrInvalidHighlight, problem{
			http.StatusBadRequest, "invalid_highlight", "Dieses Jelly kannst du nicht hervorheben.",
		}},
		{store.ErrHighlightCooldown, problem{
			http.StatusConflict, "highlight_cooldown", "Warte kurz bis zum nächsten Hervorheben.",
		}},
	}
}

// listInviteErrors returns the errors of partner emote invites.
func listInviteErrors() []knownError {
	return []knownError{
		{store.ErrInvalidPartner, problem{
			http.StatusBadRequest, "invalid_partner", "Dieses Jelly kannst du nicht auffordern.",
		}},
		{store.ErrInviteOpen, problem{
			http.StatusConflict, "partner_emote_open", "Du hast dieses Jelly schon aufgefordert.",
		}},
		{store.ErrInviteNotFound, problem{
			http.StatusNotFound, "partner_emote_not_found", "Diese Aufforderung gibt es nicht.",
		}},
		{store.ErrInviteClosed, problem{
			http.StatusConflict, "partner_emote_closed", "Diese Aufforderung ist schon vorbei.",
		}},
		{
			store.ErrInvalidInviteAnswer,
			problem{
				http.StatusBadRequest,
				"invalid_partner_emote_state",
				"Das geht bei dieser Aufforderung nicht.",
			},
		},
	}
}

// listSeatErrors returns the errors of seat codes.
func listSeatErrors() []knownError {
	return []knownError{
		{store.ErrCodeRedeemed, problem{
			http.StatusConflict, "code_redeemed",
			"Dieser Code wurde schon benutzt. Die Orga kann einen neuen vergeben.",
		}},
		{store.ErrAreaOccupied, problem{
			http.StatusConflict, "area_occupied", "In diesem Bereich stehen mehrere Jellies.",
		}},
	}
}

// listGameErrors covers LAN participation and player actions.
func listGameErrors() []knownError {
	return []knownError{
		{store.ErrNoActiveLAN, problem{
			http.StatusConflict, "no_active_lan", "Gerade läuft keine LAN.",
		}},
		{store.ErrNotJoined, problem{
			http.StatusConflict, "not_joined", "Du nimmst an dieser LAN noch nicht teil.",
		}},
		{store.ErrEventCodeInvalid, problem{
			http.StatusBadRequest, "invalid_event_code", "Dieser Event-Code gilt gerade nicht.",
		}},
		{store.ErrEventCodeRedeemed, problem{
			http.StatusConflict, "event_code_redeemed",
			"Diesen Event-Code hast du schon eingelöst.",
		}},
		{store.ErrEventCodeExists, problem{
			http.StatusConflict, "event_code_exists", "Diesen Event-Code gibt es schon.",
		}},
		{store.ErrEmoteCooldown, problem{
			http.StatusConflict, "emote_cooldown", "Warte kurz bis zum nächsten Emote.",
		}},
		{store.ErrInvalidFollow, problem{
			http.StatusBadRequest, "invalid_follow",
			"Zu diesem Jelly kannst du dich nicht stellen.",
		}},
		{store.ErrInvalidTrip, problem{
			http.StatusBadRequest, "invalid_trip", "Dieser Punkt liegt nicht auf der Bühne.",
		}},
		{store.ErrTooFar, problem{
			http.StatusConflict, "too_far", "Ihr steht nicht nah genug beieinander.",
		}},
		{store.ErrPartnerSelf, problem{
			http.StatusBadRequest, "partner_self", "Dafür brauchst du ein anderes Jelly.",
		}},
		{rules.ErrUnknownPartnerEmote, problem{
			http.StatusBadRequest, "unknown_partner_emote", "Dieses Partner-Emote gibt es nicht.",
		}},
		{rules.ErrReportCooldown, problem{
			http.StatusConflict, "report_cooldown", "Das hast du gerade erst gemeldet.",
		}},
		{rules.ErrReportLimit, problem{
			http.StatusConflict, "report_limit", "Du hast dein Tageslimit erreicht.",
		}},
		{rules.ErrUnknownEmote, problem{
			http.StatusBadRequest, "unknown_emote", "Dieses Emote gibt es nicht.",
		}},
		{rules.ErrUnknownSign, problem{
			http.StatusBadRequest, "unknown_sign", "Dieses Schild gibt es nicht.",
		}},
		{errUnknownAction, problemUnknownAction()},
	}
}

// problemUnknownAction is the response to an unknown action.
func problemUnknownAction() problem {
	return problem{http.StatusBadRequest, "unknown_action", "Diese Aktion gibt es nicht."}
}

// problemInvalidBody is the response to an invalid request.
func problemInvalidBody() problem {
	return problem{http.StatusBadRequest, "invalid_body", "Die Anfrage ist ungültig."}
}

// problemNotFound is the response to a path outside the contract.
func problemNotFound() problem {
	return problem{http.StatusNotFound, "not_found", "Diesen Weg gibt es nicht."}
}

// problemRateLimited is the response when too many attempts arrive at once.
func problemRateLimited() problem {
	return problem{http.StatusTooManyRequests, "rate_limited", "Zu viele Versuche, bitte warten."}
}

// readJSON reads exactly one JSON object and rejects unknown fields.
func (server *apiServer) readJSON(
	writer http.ResponseWriter, request *http.Request, target any,
) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, maxBodyBytes))
	decoder.DisallowUnknownFields()
	err := decoder.Decode(target)
	if err != nil {
		server.writeProblem(writer, problemInvalidBody())
		return false
	}
	if !errors.Is(decoder.Decode(&struct{}{}), io.EOF) {
		server.writeProblem(writer, problemInvalidBody())
		return false
	}
	return true
}

// writeError answers with the translation of an error.
func (server *apiServer) writeError(
	writer http.ResponseWriter, request *http.Request, err error,
) {
	server.writeProblem(writer, server.translateError(request.Context(), request.Pattern, err))
}

// translateError finds the answer to an error. Unknown errors go to the log, not to the client.
func (server *apiServer) translateError(ctx context.Context, route string, err error) problem {
	for _, known := range listKnownErrors() {
		if errors.Is(err, known.target) {
			return known.answer
		}
	}
	logFailure := server.Logger.ErrorContext
	if isClientGone(ctx, err) {
		logFailure = server.Logger.DebugContext
	}
	logFailure(ctx, "request failed", "route", route, "error", err)
	return problem{
		http.StatusInternalServerError, "internal", "Auf dem Server ist ein Fehler aufgetreten.",
	}
}

// isClientGone reports a request cancelled by its own client, which is no fault of the server.
func isClientGone(ctx context.Context, err error) bool {
	return errors.Is(err, context.Canceled) && errors.Is(ctx.Err(), context.Canceled)
}

// writeProblem writes the uniform error response.
func (server *apiServer) writeProblem(writer http.ResponseWriter, answer problem) {
	server.writeJSON(writer, answer.status, answer.toResponse())
}

// writeJSON writes a JSON response.
func (server *apiServer) writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	err := json.NewEncoder(writer).Encode(value)
	if err != nil {
		server.Logger.Error("write response failed", "error", err)
	}
}

// writeOutcome writes `value`, or the translated error if there is one.
func (server *apiServer) writeOutcome(
	writer http.ResponseWriter, request *http.Request, value any, err error,
) {
	if err != nil {
		server.writeError(writer, request, err)
		return
	}
	server.writeJSON(writer, http.StatusOK, value)
}
