package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestCreateLoggerFollowsTheLevel(t *testing.T) {
	t.Parallel()
	for _, levelName := range []string{"debug", "info", "warn", "error", "DEBUG"} {
		_, err := createLogger(&bytes.Buffer{}, levelName)
		if err != nil {
			t.Errorf("level %q: %v", levelName, err)
		}
	}
	_, err := createLogger(&bytes.Buffer{}, "loud")
	if err == nil {
		t.Error("an unknown level must fail")
	}

	logs := &bytes.Buffer{}
	logger, err := createLogger(logs, "warn")
	if err != nil {
		t.Fatal(err)
	}
	logger.InfoContext(t.Context(), "hidden")
	logger.WarnContext(t.Context(), "shown")
	if strings.Contains(logs.String(), "hidden") || !strings.Contains(logs.String(), "shown") {
		t.Fatalf("warn level logged:\n%s", logs)
	}
}

func TestServerStartNamesTheVersion(t *testing.T) {
	t.Parallel()
	logs := &bytes.Buffer{}
	logger, err := createLogger(logs, "info")
	if err != nil {
		t.Fatal(err)
	}
	logServerStart(t.Context(), logger, "jelly.db")
	wanted := []string{`msg="server starting"`, "version=dev", "api_version=", "go_version="}
	for _, want := range wanted {
		if !strings.Contains(logs.String(), want) {
			t.Errorf("start line misses %s:\n%s", want, logs)
		}
	}
}
