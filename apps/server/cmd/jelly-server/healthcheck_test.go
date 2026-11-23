package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBuildHealthURL(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		":8080":          "http://127.0.0.1:8080/health",
		"0.0.0.0:8080":   "http://127.0.0.1:8080/health",
		"[::]:8080":      "http://127.0.0.1:8080/health",
		"127.0.0.1:9000": "http://127.0.0.1:9000/health",
		"[::1]:9000":     "http://[::1]:9000/health",
		"localhost:9000": "http://localhost:9000/health",
	}
	for address, want := range cases {
		got, err := buildHealthURL(address)
		if err != nil || got != want {
			t.Errorf("buildHealthURL(%q) = %q, %v; want %q", address, got, err, want)
		}
	}
	_, err := buildHealthURL("8080")
	if err == nil {
		t.Error("an address without port must fail")
	}
}

func TestCheckHealth(t *testing.T) {
	t.Parallel()
	healthy := startHealthServer(t, http.StatusOK)
	err := checkHealth(t.Context(), healthy)
	if err != nil {
		t.Fatalf("healthy server: %v", err)
	}

	broken := startHealthServer(t, http.StatusInternalServerError)
	err = checkHealth(t.Context(), broken)
	if !errors.Is(err, errUnhealthy) {
		t.Fatalf("server answering 500: got %v, want errUnhealthy", err)
	}

	err = checkHealth(t.Context(), findClosedAddress(t))
	if err == nil {
		t.Fatal("no server listening must fail")
	}
}

// startHealthServer serves /health with the given status and returns its listen address.
func startHealthServer(t *testing.T, status int) string {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(status)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server.Listener.Addr().String()
}

// findClosedAddress returns a loopback address on which nothing listens any more.
func findClosedAddress(t *testing.T) string {
	t.Helper()
	server := httptest.NewServer(http.NotFoundHandler())
	address := server.Listener.Addr().String()
	server.Close()
	return address
}
