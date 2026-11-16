// Package simulator plays many jellies against a running server through its public API, so the
// stage and the server can be tested without real players. It knows only HTTP, not the database.
package simulator

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Defaults of a run. With these delays, 70 jellies send about 6 actions per second.
const (
	DefaultPlayers  = 70
	DefaultMinDelay = 2 * time.Second
	DefaultMaxDelay = 20 * time.Second

	maxPlayers = 1000
	maxStages  = 100
	runIDBytes = 3
)

// ErrInvalidConfig reports settings the simulator cannot run with.
var ErrInvalidConfig = errors.New("invalid simulator config")

// Config describes one simulator run.
type Config struct {
	BaseURL  string
	JoinCode string
	// RunID keeps player names unique across runs against the same database.
	RunID   string
	Players int
	// A bot waits a random time between these two before its next action.
	MinDelay time.Duration
	MaxDelay time.Duration
	// Now is the clock for response times and for the expiry of partner codes.
	Now func() time.Time
	// Streams lets every bot keep an event stream open, as the app does.
	Streams bool
	// StreamTopics narrows the streams of the bots, such as "events" for an app without the map.
	// Empty means everything.
	StreamTopics string
	// Stages is how many stage screens watch the stream with StageKey.
	Stages   int
	StageKey string
}

// Stats counts what happened during a run. Rejected actions are normal, such as a cooldown.
type Stats struct {
	Accepted int64
	Rejected int64
	// FailedActions were lost to a network or server error. Their bot keeps playing.
	FailedActions int64
	// DeadBots stopped for good because they could not register.
	DeadBots int64
	// MeanLatency and MaxLatency measure the answered actions.
	MeanLatency time.Duration
	MaxLatency  time.Duration
	// StreamMessages counts what all streams received, StreamDrops how often one ended or was
	// refused. FirstStreamDrop says why the first one did.
	StreamMessages  int64
	StreamBytes     int64
	StreamDrops     int64
	FirstStreamDrop error
}

// GenerateRunID returns an ID that differs even between runs in the same second.
func GenerateRunID() string {
	raw := make([]byte, runIDBytes)
	// crypto/rand.Read never returns an error and aborts the program itself on failure.
	_, _ = rand.Read(raw)
	return hex.EncodeToString(raw)
}

// ValidateConfig rejects settings that could only fail later in every bot.
func ValidateConfig(config Config) error {
	err := validateAddress(config.BaseURL)
	if err != nil {
		return err
	}
	if config.Players <= 0 || config.Players > maxPlayers {
		return fmt.Errorf("%w: players must be from 1 to %d", ErrInvalidConfig, maxPlayers)
	}
	if config.MinDelay <= 0 || config.MaxDelay < config.MinDelay {
		return fmt.Errorf("%w: delays must be positive and in order", ErrInvalidConfig)
	}
	err = validateStages(config)
	if err != nil {
		return err
	}
	if config.JoinCode == "" || config.RunID == "" || config.Now == nil {
		return fmt.Errorf("%w: join code, run ID and clock are required", ErrInvalidConfig)
	}
	return nil
}

// validateAddress checks that the server address can take requests.
func validateAddress(baseURL string) error {
	address, err := url.Parse(baseURL)
	if err != nil || address.Host == "" || (address.Scheme != "http" && address.Scheme != "https") {
		return fmt.Errorf(
			"%w: address %q needs http or https and a host",
			ErrInvalidConfig,
			baseURL,
		)
	}
	return nil
}

// validateStages checks the stage screens, which need the stage key to sign in.
func validateStages(config Config) error {
	if config.Stages < 0 || config.Stages > maxStages ||
		(config.Stages > 0 && config.StageKey == "") {
		return fmt.Errorf("%w: stages must be from 0 to %d and need the stage key",
			ErrInvalidConfig, maxStages)
	}
	return nil
}

// Run registers the bots and lets them play until `ctx` ends. If no bot can register, it returns
// the reason of the first one.
func Run(
	ctx context.Context, httpClient *http.Client, config Config, logger *slog.Logger,
) (Stats, error) {
	err := ValidateConfig(config)
	if err != nil {
		return Stats{}, err
	}
	baseURL := strings.TrimRight(config.BaseURL, "/")
	client := apiClient{httpClient: httpClient, baseURL: baseURL}
	// A stream stays open for the whole run, so it must not hit the time limit of single requests.
	streamClient := apiClient{
		httpClient: &http.Client{Transport: httpClient.Transport},
		baseURL:    baseURL,
	}
	results := &counters{}
	var waitGroup sync.WaitGroup
	for range config.Stages {
		// Concurrency plan: one goroutine per stage screen, started here. Each ends when ctx ends
		// and is awaited below. A dropped stream is counted and opened again.
		waitGroup.Go(func() {
			streamClient.watchStream(ctx, buildStagePath(config.StageKey), "", results)
		})
	}
	for index := range config.Players {
		player := bot{
			client: client, streamClient: streamClient, streams: &waitGroup, results: results,
			config: config, index: index, playerID: 0, token: "",
		}
		// Concurrency plan: one goroutine per bot, started here. Each ends when ctx ends and
		// is awaited below. A failed registration ends only that bot and is counted.
		waitGroup.Go(func() {
			playErr := player.play(ctx)
			if ctx.Err() == nil {
				logger.ErrorContext(ctx, "bot stopped", "bot", index, "error", playErr)
				results.recordDeadBot(playErr)
			}
		})
	}
	waitGroup.Wait()
	stats := results.buildStats()
	if stats.DeadBots == int64(config.Players) {
		return stats, fmt.Errorf("no bot could register: %w", results.loadFirstDeath())
	}
	return stats, nil
}

// counters are updated by all bots at once.
type counters struct {
	accepted     atomic.Int64
	rejected     atomic.Int64
	failed       atomic.Int64
	deadBots     atomic.Int64
	answered     atomic.Int64
	totalLatency atomic.Int64
	maxLatency   atomic.Int64
	firstDeath   atomic.Pointer[error]

	streamMessages  atomic.Int64
	streamBytes     atomic.Int64
	streamDrops     atomic.Int64
	firstStreamDrop atomic.Pointer[error]
}

// recordDeadBot counts a bot that stopped for good and keeps the first reason.
func (results *counters) recordDeadBot(reason error) {
	results.deadBots.Add(1)
	results.firstDeath.CompareAndSwap(nil, &reason)
}

// loadFirstDeath returns why the first bot stopped.
func (results *counters) loadFirstDeath() error {
	reason := results.firstDeath.Load()
	if reason == nil {
		return nil
	}
	return *reason
}

// recordLatency adds the response time of one answered action.
func (results *counters) recordLatency(latency time.Duration) {
	results.answered.Add(1)
	results.totalLatency.Add(int64(latency))
	for {
		current := results.maxLatency.Load()
		isNewMax := int64(latency) > current
		if !isNewMax || results.maxLatency.CompareAndSwap(current, int64(latency)) {
			return
		}
	}
}

// buildStats reads the final numbers once all bots have ended.
func (results *counters) buildStats() Stats {
	stats := Stats{
		Accepted: results.accepted.Load(), Rejected: results.rejected.Load(),
		FailedActions: results.failed.Load(), DeadBots: results.deadBots.Load(),
		MeanLatency: 0, MaxLatency: time.Duration(results.maxLatency.Load()),
		StreamMessages: results.streamMessages.Load(), StreamBytes: results.streamBytes.Load(),
		StreamDrops:     results.streamDrops.Load(),
		FirstStreamDrop: nil,
	}
	if reason := results.firstStreamDrop.Load(); reason != nil {
		stats.FirstStreamDrop = *reason
	}
	answered := results.answered.Load()
	if answered > 0 {
		stats.MeanLatency = time.Duration(results.totalLatency.Load() / answered)
	}
	return stats
}
