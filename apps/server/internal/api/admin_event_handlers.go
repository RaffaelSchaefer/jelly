package api

import (
	"net/http"
	"net/url"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
	"github.com/RaffaelSchaefer/jelly/apps/server/internal/store"
)

// queryDryRun asks a map import to only report what it would change.
const queryDryRun = "dry_run"

// gatheringAnswer wraps the running gathering, so that the answer is an object even without one.
type gatheringAnswer struct {
	Gathering *store.Gathering `json:"gathering"`
}

// handleLoadGathering says whether a food event or a ceremony is running, so the admin page can
// show it after a reload.
func (server *apiServer) handleLoadGathering(writer http.ResponseWriter, request *http.Request) {
	lanID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	gathering, err := server.Store.LoadGathering(request.Context(), lanID, server.currentMillis())
	server.writeOutcome(writer, request, gatheringAnswer{Gathering: gathering}, err)
}

// handleEndEventCode makes an event code invalid from now on.
func (server *apiServer) handleEndEventCode(writer http.ResponseWriter, request *http.Request) {
	codeID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	err := server.Store.EndEventCode(request.Context(), codeID, server.currentMillis())
	server.writeOutcome(writer, request, map[string]bool{fieldUpdated: true}, err)
}

// handleGiveXP grants XP to a player or bot in its current LAN. XP is never taken away.
func (server *apiServer) handleGiveXP(writer http.ResponseWriter, request *http.Request) {
	playerID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	var body struct {
		XP int `json:"xp"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	err := server.Store.GiveXP(request.Context(), playerID, body.XP, server.currentMillis())
	server.writeOutcome(writer, request, map[string]bool{fieldUpdated: true}, err)
}

// handleGrantAchievement gives a player or bot an achievement from the catalog.
func (server *apiServer) handleGrantAchievement(
	writer http.ResponseWriter, request *http.Request,
) {
	playerID, valid := server.readPathID(writer, request)
	if !valid {
		return
	}
	var body struct {
		Key string `json:"key"`
	}
	if !server.readJSON(writer, request, &body) {
		return
	}
	err := server.Store.GrantAchievement(
		request.Context(), playerID, body.Key, server.currentMillis(),
	)
	server.writeOutcome(writer, request, map[string]bool{fieldUpdated: true}, err)
}

// handleListAchievements lists every achievement, the secret ones too, which the public catalog
// leaves out.
func (server *apiServer) handleListAchievements(writer http.ResponseWriter, _ *http.Request) {
	server.writeJSON(writer, http.StatusOK, rules.ListAchievements())
}

// stageLink is the address of the stage with its key, for a button on the admin page.
type stageLink struct {
	Path string `json:"path"`
}

// handleStageLink gives the organizers the stage address, so nobody has to type the key.
func (server *apiServer) handleStageLink(writer http.ResponseWriter, _ *http.Request) {
	path := "/stage/?key=" + url.QueryEscape(server.StageKey)
	server.writeJSON(writer, http.StatusOK, stageLink{Path: path})
}
