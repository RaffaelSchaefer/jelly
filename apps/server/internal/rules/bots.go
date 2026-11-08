package rules

// What a bot can do. Food and drink reuse the report actions.
const (
	BotActionPoke   = "poke"
	BotActionEmote  = "emote"
	BotActionSign   = "sign"
	BotActionTrip   = "trip"
	BotActionFollow = "follow"
	BotActionStack  = "stack"
	BotActionXP     = "xp"
	BotActionRedeem = "redeem"
	// BotActionOdds is one in how many seconds an automatic bot acts, so a crowd stays calm.
	BotActionOdds = 20
)

// botChoice is an action with its share of all automatic actions.
type botChoice struct {
	action string
	weight int
}

// listBotChoices returns what automatic bots do and how often. XP stays a manual gift.
func listBotChoices() []botChoice {
	const (
		weightEmote  = 30
		weightSign   = 15
		weightPoke   = 20
		weightReport = 5
		weightTrip   = 15
		weightFollow = 10
		weightStack  = 5
	)
	return []botChoice{
		{BotActionEmote, weightEmote},
		{BotActionSign, weightSign},
		{BotActionPoke, weightPoke},
		{ActionFood, weightReport},
		{ActionDrink, weightReport},
		{BotActionTrip, weightTrip},
		{BotActionFollow, weightFollow},
		{BotActionStack, weightStack},
	}
}

// CountBotChoices returns the range for the roll of [ChooseBotAction].
func CountBotChoices() int {
	total := 0
	for _, choice := range listBotChoices() {
		total += choice.weight
	}
	return total
}

// ChooseBotAction picks an action for a roll from 0 up to [CountBotChoices].
func ChooseBotAction(roll int) string {
	for _, choice := range listBotChoices() {
		if roll < choice.weight {
			return choice.action
		}
		roll -= choice.weight
	}
	return BotActionEmote
}
