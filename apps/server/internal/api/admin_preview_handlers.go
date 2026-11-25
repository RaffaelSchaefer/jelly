package api

import (
	"net/http"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// previewLevelCount is how many levels the preview of the curve shows.
const previewLevelCount = 20

// levelPreview is the answer of `POST /admin/api/level-preview`.
type levelPreview struct {
	Levels []rules.LevelStep `json:"levels"`
}

// handlePreviewLevels shows the first levels of a curve before the orga saves it. The page does not
// mirror the rules, so the server does the sums.
func (server *apiServer) handlePreviewLevels(writer http.ResponseWriter, request *http.Request) {
	body := rules.DefaultRules()
	if !server.readJSON(writer, request, &body) {
		return
	}
	if err := rules.ValidateRules(body); err != nil {
		server.writeError(writer, request, err)
		return
	}
	preview := levelPreview{Levels: rules.ListLevelSteps(body, previewLevelCount)}
	server.writeJSON(writer, http.StatusOK, preview)
}
