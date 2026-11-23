package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"
)

const (
	commandHealthcheck = "healthcheck"
	// healthcheckTimeout stays below the timeout of the Docker healthcheck, so the command can
	// still report why it failed.
	healthcheckTimeout = 2 * time.Second
)

var errUnhealthy = errors.New("server is not healthy")

// runHealthcheck asks the server on JELLY_ADDR for its health. The image has no shell and no
// wget, so the Docker healthcheck calls this command instead.
func runHealthcheck(ctx context.Context) error {
	return checkHealth(ctx, readEnv("JELLY_ADDR", ":8080"))
}

// checkHealth fails unless GET /health on the server listening on address answers 200.
func checkHealth(ctx context.Context, address string) error {
	healthURL, err := buildHealthURL(address)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, healthcheckTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, http.NoBody)
	if err != nil {
		return fmt.Errorf("build health request: %w", err)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return fmt.Errorf("ask for health: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	// Reading the rest lets the connection close cleanly; the body itself does not matter.
	_, _ = io.Copy(io.Discard, response.Body)
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("%w: status %d", errUnhealthy, response.StatusCode)
	}
	return nil
}

// buildHealthURL turns a listen address into the URL of its health route. An address without
// host or with 0.0.0.0 or [::] listens everywhere, loopback included.
func buildHealthURL(address string) (string, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return "", fmt.Errorf("read JELLY_ADDR %q: %w", address, err)
	}
	ip := net.ParseIP(host)
	if host == "" || (ip != nil && ip.IsUnspecified()) {
		host = "127.0.0.1"
	}
	return "http://" + net.JoinHostPort(host, port) + "/health", nil
}
