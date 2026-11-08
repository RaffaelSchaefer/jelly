package api

import "context"

// PlayBotsForTest runs one tick of the automatic bots without waiting for the timer.
func (service *Service) PlayBotsForTest(ctx context.Context) {
	service.server.playBots(ctx)
}
