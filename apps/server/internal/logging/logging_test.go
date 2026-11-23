package logging_test

import (
	"bytes"
	"strings"
	"testing"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/logging"
)

func TestNewFollowsTheLevel(t *testing.T) {
	t.Parallel()
	for _, levelName := range []string{"debug", "info", "warn", "error", "DEBUG"} {
		_, err := logging.New(&bytes.Buffer{}, levelName)
		if err != nil {
			t.Errorf("level %q: %v", levelName, err)
		}
	}
	_, err := logging.New(&bytes.Buffer{}, "loud")
	if err == nil {
		t.Error("an unknown level must fail")
	}

	logs := &bytes.Buffer{}
	logger, err := logging.New(logs, "warn")
	if err != nil {
		t.Fatal(err)
	}
	logger.InfoContext(t.Context(), "hidden")
	logger.WarnContext(t.Context(), "shown")
	if strings.Contains(logs.String(), "hidden") || !strings.Contains(logs.String(), "shown") {
		t.Fatalf("warn level logged:\n%s", logs)
	}
}
