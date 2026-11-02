package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	fieldLoggedIn   = "logged_in"
	adminCookieName = "jelly_admin"
	adminCookiePath = "/admin"
	adminIdleLimit  = 30 * time.Minute
	cookieSeparator = "."
	// Separates this signature from any other use of the admin secret.
	adminCookieLabel = "admin-session:"
)

// addSessionRoutes registers logging in and out of the admin page.
func (server *apiServer) addSessionRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /admin/api/login", server.limitAttempts(server.handleAdminLogin))
	mux.HandleFunc("POST /admin/api/logout", server.handleAdminLogout)
}

// handleAdminLogin exchanges the admin secret for a session cookie.
func (server *apiServer) handleAdminLogin(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Secret string `json:"secret"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	if !matchSecret(server.AdminSecret, body.Secret) {
		server.writeError(writer, request, errForbidden)
		return
	}
	server.writeAdminCookie(writer)
	server.writeJSON(writer, http.StatusOK, map[string]bool{fieldLoggedIn: true})
}

// handleAdminLogout clears the cookie in this browser. A copy of it stays valid until it expires.
func (server *apiServer) handleAdminLogout(writer http.ResponseWriter, _ *http.Request) {
	http.SetCookie(writer, buildAdminCookie("", time.Unix(0, 0)))
	server.writeJSON(writer, http.StatusOK, map[string]bool{fieldLoggedIn: false})
}

// writeAdminCookie issues a session that expires after the idle limit.
func (server *apiServer) writeAdminCookie(writer http.ResponseWriter) {
	expiresAt := server.Now().Add(adminIdleLimit)
	value := buildAdminSession(server.AdminSecret, expiresAt.UnixMilli())
	http.SetCookie(writer, buildAdminCookie(value, expiresAt))
}

// buildAdminCookie sets the attributes that keep the session away from scripts and other sites.
// Browsers and curl accept Secure cookies on localhost too, so local tests work without HTTPS.
func buildAdminCookie(value string, expiresAt time.Time) *http.Cookie {
	return &http.Cookie{
		Name:     adminCookieName,
		Value:    value,
		Path:     adminCookiePath,
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	}
}

// hasAdminSession reports whether the request carries a valid session that has not expired.
func (server *apiServer) hasAdminSession(request *http.Request) bool {
	cookie, err := request.Cookie(adminCookieName)
	if err != nil {
		return false
	}
	return isAdminSessionValid(server.AdminSecret, cookie.Value, server.currentMillis())
}

// buildAdminSession returns the expiry time with its signature.
func buildAdminSession(secret string, expiresAt int64) string {
	expiry := strconv.FormatInt(expiresAt, 10)
	return expiry + cookieSeparator + signAdminExpiry(secret, expiry)
}

// isAdminSessionValid checks the signature first, so the expiry time can be trusted.
func isAdminSessionValid(secret, session string, now int64) bool {
	expiry, signature, found := strings.Cut(session, cookieSeparator)
	if !found || secret == "" {
		return false
	}
	if !hmac.Equal([]byte(signature), []byte(signAdminExpiry(secret, expiry))) {
		return false
	}
	expiresAt, err := strconv.ParseInt(expiry, 10, 64)
	return err == nil && now < expiresAt
}

// signAdminExpiry signs an expiry time with the admin secret.
func signAdminExpiry(secret, expiry string) string {
	signer := hmac.New(sha256.New, []byte(secret))
	_, _ = signer.Write([]byte(adminCookieLabel + expiry)) // A hash never returns a write error.
	return hex.EncodeToString(signer.Sum(nil))
}
