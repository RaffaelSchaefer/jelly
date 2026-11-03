package simulator

import (
	"slices"
	"sync"
)

// partnerOffer is a code one bot waits to be entered.
type partnerOffer struct {
	code      string
	botIndex  int
	expiresAt int64
}

// offerBoard stands in for the spoken code: bots leave codes here for others to enter.
type offerBoard struct {
	guard  sync.Mutex
	offers []partnerOffer
}

// addOffer leaves a new code. The server has just replaced an older code of this bot.
func (board *offerBoard) addOffer(offer partnerOffer) {
	board.guard.Lock()
	defer board.guard.Unlock()
	board.offers = slices.DeleteFunc(board.offers, func(existing partnerOffer) bool {
		return existing.botIndex == offer.botIndex
	})
	board.offers = append(board.offers, offer)
}

// returnOffer puts back a code that could not be tried, unless its bot has a newer one.
func (board *offerBoard) returnOffer(offer partnerOffer) {
	board.guard.Lock()
	defer board.guard.Unlock()
	hasNewer := slices.ContainsFunc(board.offers, func(existing partnerOffer) bool {
		return existing.botIndex == offer.botIndex
	})
	if !hasNewer {
		board.offers = append(board.offers, offer)
	}
}

// takeOffer drops expired codes, then removes and returns the oldest code of another bot.
func (board *offerBoard) takeOffer(botIndex int, now int64) (partnerOffer, bool) {
	board.guard.Lock()
	defer board.guard.Unlock()
	board.offers = slices.DeleteFunc(board.offers, func(existing partnerOffer) bool {
		return existing.expiresAt <= now
	})
	for index, offer := range board.offers {
		if offer.botIndex != botIndex {
			board.offers = slices.Delete(board.offers, index, index+1)
			return offer, true
		}
	}
	return partnerOffer{}, false
}
