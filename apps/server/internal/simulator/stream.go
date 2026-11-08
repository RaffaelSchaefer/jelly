package simulator

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var (
	errUnexpectedStatus = errors.New("unexpected status")
	errStreamEnded      = errors.New("stream ended")
)

const (
	pathStream = apiPrefix + "/stage/events"
	// A dropped stream opens again after this pause, like the app does.
	streamRetryDelay = time.Second
	streamDataPrefix = "data:"
	// One SSE line can hold a whole move with its points.
	maxStreamLineBytes = 1 << 20
)

// buildPlayerPath returns the stream of a bot, narrowed to some topics if they are given.
func buildPlayerPath(topics string) string {
	if topics == "" {
		return pathStream
	}
	return pathStream + "?topics=" + url.QueryEscape(topics)
}

// buildStagePath returns the stream of a stage, which signs in with the stage key instead of a
// token.
func buildStagePath(stageKey string) string {
	return pathStream + "?key=" + url.QueryEscape(stageKey)
}

// watchStream keeps one event stream open until `ctx` ends and counts what arrives. A stream that
// ends or is refused counts as dropped and opens again after a pause.
func (client apiClient) watchStream(ctx context.Context, path, token string, results *counters) {
	for ctx.Err() == nil {
		err := client.readStream(ctx, path, token, results)
		if ctx.Err() != nil {
			return
		}
		results.streamDrops.Add(1)
		results.firstStreamDrop.CompareAndSwap(nil, &err)
		if waitFor(ctx, streamRetryDelay) != nil {
			return
		}
	}
}

// readStream reads one stream until it ends and counts its messages.
func (client apiClient) readStream(
	ctx context.Context, path, token string, results *counters,
) error {
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		client.baseURL+path,
		http.NoBody,
	)
	if err != nil {
		return fmt.Errorf("build stream request: %w", err)
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response, err := client.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("open stream: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("%w: stream answered %d", errUnexpectedStatus, response.StatusCode)
	}
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 0, bufio.MaxScanTokenSize), maxStreamLineBytes)
	for scanner.Scan() {
		// The scanner drops the line break, which also travels.
		results.streamBytes.Add(int64(len(scanner.Bytes()) + 1))
		if strings.HasPrefix(scanner.Text(), streamDataPrefix) {
			results.streamMessages.Add(1)
		}
	}
	err = scanner.Err()
	if err != nil {
		return fmt.Errorf("read stream: %w", err)
	}
	return errStreamEnded
}
