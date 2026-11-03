package api

import (
	"sync"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// streamSlots counts open streams, because each one reads the database regularly.
type streamSlots struct {
	guard    sync.Mutex
	total    int
	byPlayer map[int64]int
}

// newStreamSlots creates a counter without open streams.
func newStreamSlots() *streamSlots {
	return &streamSlots{guard: sync.Mutex{}, total: 0, byPlayer: map[int64]int{}}
}

// claimSlot reserves a stream if the limits of the LAN allow it. The stage does not count, so
// players cannot take the picture off the projector by filling the limit.
func (slots *streamSlots) claimSlot(viewerID int64, gameRules rules.Rules) bool {
	if viewerID == noViewerPlayer {
		return true
	}
	slots.guard.Lock()
	defer slots.guard.Unlock()
	isFull := slots.total >= gameRules.MaxStreams
	if isFull || slots.byPlayer[viewerID] >= gameRules.MaxPlayerStreams {
		return false
	}
	slots.total++
	slots.byPlayer[viewerID]++
	return true
}

// releaseSlot frees a stream. Empty entries go away, so the map only holds open streams.
func (slots *streamSlots) releaseSlot(viewerID int64) {
	if viewerID == noViewerPlayer {
		return
	}
	slots.guard.Lock()
	defer slots.guard.Unlock()
	slots.total--
	slots.byPlayer[viewerID]--
	if slots.byPlayer[viewerID] == 0 {
		delete(slots.byPlayer, viewerID)
	}
}
