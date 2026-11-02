package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

const maxBodyBytes = 4 << 10

// problem is an error response with a stable code. `message` is shown in the German app.
type problem struct {
	status  int
	code    string
	message string
}

// knownError maps an error to its error response.
type knownError struct {
	target error
	answer problem
}

// listKnownErrors returns all errors the client may learn about.
func listKnownErrors() []knownError {
	return append(listPlayerErrors(), listGameErrors()...)
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
		{store.ErrLANOverlap, problem{
			http.StatusConflict, "lan_overlap", "Der Zeitraum überschneidet sich mit einer LAN.",
		}},
		{store.ErrInvalidInput, problem{
			http.StatusBadRequest, "invalid_input", "Die Angaben sind unvollständig.",
		}},
		{store.ErrAreaNotFound, problem{
			http.StatusNotFound, "area_not_found", "Diesen Bereich gibt es nicht.",
		}},
		{rules.ErrInvalidArea, problem{
			http.StatusBadRequest, "invalid_area", "Dieser Bereich passt nicht auf die Bühne.",
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

// listGameErrors covers LAN participation and player actions.
func listGameErrors() []knownError {
	return []knownError{
		{store.ErrNoActiveLAN, problem{
			http.StatusConflict, "no_active_lan", "Gerade läuft keine LAN.",
		}},
		{store.ErrNotJoined, problem{
			http.StatusConflict, "not_joined", "Du nimmst an dieser LAN noch nicht teil.",
		}},
		{store.ErrAlreadyJoined, problem{
			http.StatusConflict, "already_joined", "Du nimmst an dieser LAN schon teil.",
		}},
		{store.ErrCosmeticLocked, problem{
			http.StatusConflict, "cosmetic_locked",
			"Dieses Cosmetic ist noch nicht freigeschaltet.",
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
		{store.ErrPartnerCodeInvalid, problem{
			http.StatusBadRequest, "invalid_partner_code", "Dieser Code gilt gerade nicht.",
		}},
		{store.ErrPartnerSelf, problem{
			http.StatusBadRequest, "partner_self", "Dafür brauchst du ein anderes Jelly.",
		}},
		{store.ErrPartnerCodesBusy, problem{
			http.StatusConflict, "partner_codes_busy", "Gerade sind alle Codes belegt.",
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

// writeError translates an error. Unknown errors go to the log, not to the client.
func (server *apiServer) writeError(
	writer http.ResponseWriter, request *http.Request, err error,
) {
	for _, known := range listKnownErrors() {
		if errors.Is(err, known.target) {
			server.writeProblem(writer, known.answer)
			return
		}
	}
	server.Logger.ErrorContext(request.Context(), "request failed",
		"route", request.Pattern, "error", err)
	server.writeProblem(writer, problem{
		http.StatusInternalServerError, "internal", "Auf dem Server ist ein Fehler aufgetreten.",
	})
}

// writeProblem writes the uniform error response.
func (server *apiServer) writeProblem(writer http.ResponseWriter, answer problem) {
	server.writeJSON(writer, answer.status, map[string]any{
		"error": map[string]string{"code": answer.code, "message": answer.message},
	})
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
