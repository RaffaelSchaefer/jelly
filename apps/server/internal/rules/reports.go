package rules

import "errors"

// Report actions a player can send for XP.
const (
	ActionPoke  = "poke"
	ActionFood  = "food"
	ActionDrink = "drink"
)

var (
	// ErrUnknownReport reports an action that is neither food nor drink.
	ErrUnknownReport = errors.New("unknown report")
	// ErrReportCooldown reports a repeated report before its cooldown ended.
	ErrReportCooldown = errors.New("report is on cooldown")
	// ErrReportLimit reports that the rolling report window is full.
	ErrReportLimit = errors.New("report limit reached")
)

// ReportEntry is a past report.
type ReportEntry struct {
	Action string
	At     int64
}

// ReportStatus tells a client what a player can report right now.
type ReportStatus struct {
	FoodReadyAt  int64 `json:"food_ready_at"`
	DrinkReadyAt int64 `json:"drink_ready_at"`
	ReportsLeft  int   `json:"reports_left"`
}

// FindReportXP returns the XP for a report action.
func FindReportXP(gameRules Rules, action string) (int, error) {
	switch action {
	case ActionFood:
		return gameRules.FoodXP, nil
	case ActionDrink:
		return gameRules.DrinkXP, nil
	default:
		return 0, ErrUnknownReport
	}
}

// CheckReport decides whether a report counts now. The cooldown is checked first, as in the app.
func CheckReport(gameRules Rules, action string, history []ReportEntry, now int64) error {
	_, err := FindReportXP(gameRules, action)
	if err != nil {
		return err
	}
	if now < findReadyTime(gameRules, action, history) {
		return ErrReportCooldown
	}
	if countReportsInWindow(gameRules, history, now) >= gameRules.ReportsPerWindow {
		return ErrReportLimit
	}
	return nil
}

// CalculateReportStatus summarises the report history for a client.
func CalculateReportStatus(gameRules Rules, history []ReportEntry, now int64) ReportStatus {
	reportsLeft := gameRules.ReportsPerWindow - countReportsInWindow(gameRules, history, now)
	return ReportStatus{
		FoodReadyAt:  findReadyTime(gameRules, ActionFood, history),
		DrinkReadyAt: findReadyTime(gameRules, ActionDrink, history),
		ReportsLeft:  max(reportsLeft, 0),
	}
}

// findReadyTime returns when this action can be reported again, 0 if it never was.
func findReadyTime(gameRules Rules, action string, history []ReportEntry) int64 {
	var lastAt int64
	for _, entry := range history {
		if entry.Action == action && entry.At > lastAt {
			lastAt = entry.At
		}
	}
	if lastAt == 0 {
		return 0
	}
	return lastAt + gameRules.ReportCooldownSeconds*millisPerSecond
}

// countReportsInWindow counts all reports inside the rolling window.
func countReportsInWindow(gameRules Rules, history []ReportEntry, now int64) int {
	window := gameRules.ReportWindowSeconds * millisPerSecond
	count := 0
	for _, entry := range history {
		if now-entry.At < window {
			count++
		}
	}
	return count
}
