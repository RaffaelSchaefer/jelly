package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/api"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/web"
)

const (
	readHeaderTimeout = 5 * time.Second
	readTimeout       = 15 * time.Second
	idleTimeout       = 2 * time.Minute
	// Streams extend this themselves for every message.
	writeTimeout = 30 * time.Second
	// Below the 10 second limit of `docker stop`, which kills the process after that.
	shutdownTimeout = 8 * time.Second
)

var errMissingSecret = errors.New("JELLY_STAGE_KEY and JELLY_ADMIN_SECRET are required")

// runServer opens the database and serves HTTP until `appCtx` ends.
func runServer(appCtx context.Context, logger *slog.Logger) error {
	stageKey := os.Getenv("JELLY_STAGE_KEY")
	adminSecret := os.Getenv("JELLY_ADMIN_SECRET")
	if stageKey == "" || adminSecret == "" {
		return errMissingSecret
	}
	minClientVersion := os.Getenv("JELLY_MIN_CLIENT_VERSION")
	err := rules.ValidateClientVersion(minClientVersion)
	if err != nil {
		return fmt.Errorf("JELLY_MIN_CLIENT_VERSION: %w", err)
	}
	database, err := openDatabase(appCtx)
	if err != nil {
		return err
	}
	defer func() { _ = database.Close() }()

	pages, err := web.NewHandler()
	if err != nil {
		return fmt.Errorf("load pages: %w", err)
	}
	service := api.NewService(api.Dependencies{
		Store:            database,
		Now:              time.Now,
		Logger:           logger,
		StageKey:         stageKey,
		AdminSecret:      adminSecret,
		MinClientVersion: minClientVersion,
		IsStopping:       func() bool { return appCtx.Err() != nil },
		Web:              pages,
	})
	movementCtx, stopMovement := context.WithCancel(appCtx)
	defer stopMovement()
	var waitGroup sync.WaitGroup
	// Concurrency plan: started once here, ends with stopMovement or the signal and is awaited
	// below, before the database closes. A failed plan is logged and tried again a second later.
	waitGroup.Go(func() { service.RunMovement(movementCtx) })
	serveErr := serveHTTP(appCtx, service.Handler, readEnv("JELLY_ADDR", ":8080"), logger)
	stopMovement()
	waitGroup.Wait()
	return serveErr
}

// serveHTTP runs until `appCtx` ends or the server fails.
func serveHTTP(
	appCtx context.Context, handler http.Handler, address string, logger *slog.Logger,
) error {
	// Problem: requests derived directly from appCtx would be cancelled by the signal.
	// Example: SIGTERM during a poke fails its transaction instead of letting it finish.
	// Fix: requests get their own branch, which is cancelled only after the shutdown.
	requestsCtx, cancelRequests := context.WithCancel(context.WithoutCancel(appCtx))
	defer cancelRequests()
	server := &http.Server{
		Addr:              address,
		Handler:           handler,
		BaseContext:       func(net.Listener) context.Context { return requestsCtx },
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}
	serverCtx, stopServer := context.WithCancel(appCtx)
	defer stopServer()

	var shutdownErr error
	var waitGroup sync.WaitGroup
	// Concurrency plan: ends with stopServer at the latest and is awaited below.
	waitGroup.Go(func() {
		<-serverCtx.Done()
		shutdownErr = shutdownServer(serverCtx, server)
		cancelRequests()
	})

	logger.InfoContext(appCtx, "server running", "address", address)
	listenErr := server.ListenAndServe()
	stopServer()
	waitGroup.Wait()
	if !errors.Is(listenErr, http.ErrServerClosed) {
		return fmt.Errorf("start server: %w", listenErr)
	}
	return shutdownErr
}

// shutdownServer finishes open requests, even if `ctx` has already ended.
func shutdownServer(ctx context.Context, server *http.Server) error {
	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), shutdownTimeout)
	defer cancel()
	err := server.Shutdown(shutdownCtx)
	if err != nil {
		return fmt.Errorf("stop server: %w", err)
	}
	return nil
}
