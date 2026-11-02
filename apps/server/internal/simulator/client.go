package simulator

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

const maxResponseBytes = 1 << 20

// apiClient sends JSON requests to the server.
type apiClient struct {
	httpClient *http.Client
	baseURL    string
}

// apiCall is one request. `target` receives the response body of a success and may be nil.
type apiCall struct {
	method string
	path   string
	token  string
	body   any
	target any
}

// send runs a call and returns its HTTP status.
func (client apiClient) send(ctx context.Context, call apiCall) (int, error) {
	var body io.Reader = http.NoBody
	if call.body != nil {
		encoded, err := json.Marshal(call.body)
		if err != nil {
			return 0, fmt.Errorf("encode request: %w", err)
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, call.method, client.baseURL+call.path, body)
	if err != nil {
		return 0, fmt.Errorf("build request: %w", err)
	}
	if call.token != "" {
		request.Header.Set("Authorization", "Bearer "+call.token)
	}
	response, err := client.httpClient.Do(request)
	if err != nil {
		return 0, fmt.Errorf("send request: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode >= http.StatusBadRequest || call.target == nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxResponseBytes))
		return response.StatusCode, nil
	}
	err = json.NewDecoder(io.LimitReader(response.Body, maxResponseBytes)).Decode(call.target)
	if err != nil && !errors.Is(err, io.EOF) {
		return response.StatusCode, fmt.Errorf("read response: %w", err)
	}
	return response.StatusCode, nil
}
