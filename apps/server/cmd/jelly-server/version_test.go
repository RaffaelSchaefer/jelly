package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/logging"
)

func TestServerStartNamesTheVersion(t *testing.T) {
	t.Parallel()
	logs := &bytes.Buffer{}
	logger, err := logging.New(logs, "info")
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
