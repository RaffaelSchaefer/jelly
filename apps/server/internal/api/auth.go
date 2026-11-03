package api

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// noViewerPlayer is the viewer ID of a stage, which sees only public events.
const noViewerPlayer int64 = 0

// errForbidden reports a wrong admin secret.
var errForbidden = errors.New("access denied")

// authedHandler is a handler with an already verified account.
type authedHandler func(writer http.ResponseWriter, request *http.Request, playerID int64)

// viewerHandler is a handler for a stage or a player.
type viewerHandler func(writer http.ResponseWriter, request *http.Request, viewerID int64)

// requirePlayer verifies the bearer token and passes on the account ID.
func (server *apiServer) requirePlayer(next authedHandler) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		token := readBearerToken(request)
		if token == "" {
			server.writeError(writer, request, store.ErrUnauthorized)
			return
		}
		playerID, err := server.Store.FindPlayerByToken(request.Context(), token)
		if err != nil {
			server.writeError(writer, request, err)
			return
		}
		next(writer, request, playerID)
	}
}

// requireViewer accepts the stage key from the link or a player token.
func (server *apiServer) requireViewer(next viewerHandler) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if matchSecret(server.StageKey, request.URL.Query().Get("key")) {
			next(writer, request, noViewerPlayer)
			return
		}
		server.requirePlayer(authedHandler(next))(writer, request)
	}
}

// requireAdmin checks the session cookie and renews it, so only 30 idle minutes end a session.
// Without a configured secret, the admin area stays closed.
func (server *apiServer) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if !server.hasAdminSession(request) {
			server.writeError(writer, request, errForbidden)
			return
		}
		server.writeAdminCookie(writer)
		next(writer, request)
	}
}

// limitAttempts protects routes that check guessable codes.
func (server *apiServer) limitAttempts(next http.HandlerFunc) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if !server.attempts.Allow() {
			server.writeProblem(writer, problemRateLimited())
			return
		}
		next(writer, request)
	}
}

// readBearerToken returns the token of the Authorization header, or an empty string.
func readBearerToken(request *http.Request) string {
	token, found := strings.CutPrefix(request.Header.Get("Authorization"), "Bearer ")
	if !found {
		return ""
	}
	return token
}

// matchSecret compares in constant time. An unconfigured secret never matches.
func matchSecret(expected, provided string) bool {
	if expected == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) == 1
}
