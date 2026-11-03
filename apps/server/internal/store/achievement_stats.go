package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

const secondsPerDay = 86_400

// metricQuery counts one metric. `?1` is the player and `?2` the LAN.
type metricQuery struct {
	metric rules.Metric
	query  string
}

// listMetricQueries returns everything that can be counted in one SQL statement.
func listMetricQueries() []metricQuery {
	return []metricQuery{
		{rules.MetricPokes, `SELECT COUNT(*) FROM xp_log
			WHERE player_id = ?1 AND action = '` + actionPoke + `'`},
		{rules.MetricDrinks, `SELECT COUNT(*) FROM xp_log
			WHERE player_id = ?1 AND lan_id = ?2 AND action = '` + rules.ActionDrink + `'`},
		{rules.MetricEventsLAN, `SELECT COUNT(*) FROM xp_log
			WHERE player_id = ?1 AND lan_id = ?2 AND action = '` + actionEvent + `'`},
		{rules.MetricEventsTotal, `SELECT COUNT(*) FROM xp_log
			WHERE player_id = ?1 AND action = '` + actionEvent + `'`},
		{rules.MetricLANsAttended, `SELECT COUNT(*) FROM lan_entries
			WHERE player_id = ?1 AND last_seen_at > 0`},
		{rules.MetricProfileEdits, `SELECT COUNT(*) FROM event_log
			WHERE player_id = ?1 AND type = '` + EventPlayerUpdated + `'
			AND json_extract(payload, '$.` + payloadEdited + `') = 1`},
		{rules.MetricJelliesJoined, `SELECT COUNT(DISTINCT json_extract(payload, '$.target_id'))
			FROM event_log WHERE player_id = ?1 AND lan_id = ?2
			AND type = '` + EventFollowChanged + `'
			AND json_extract(payload, '$.target_id') IS NOT NULL`},
		{rules.MetricAwards, `SELECT COUNT(*) FROM awards WHERE player_id = ?1`},
		{rules.MetricPartners, `SELECT COUNT(DISTINCT partner_id) FROM partner_emotes
			WHERE player_id = ?1 AND lan_id = ?2`},
		{rules.MetricPartnerAreas, `SELECT COUNT(DISTINCT other.area_id) FROM partner_emotes pe
			JOIN lan_entries other ON other.lan_id = pe.lan_id AND other.player_id = pe.partner_id
			JOIN lan_entries mine ON mine.lan_id = pe.lan_id AND mine.player_id = pe.player_id
			WHERE pe.player_id = ?1 AND pe.lan_id = ?2
			AND other.area_id IS NOT NULL AND other.area_id IS NOT mine.area_id`},
		{rules.MetricEmoteKinds, `SELECT COUNT(DISTINCT json_extract(payload, '$.key'))
			FROM event_log WHERE player_id = ?1 AND type = '` + EventEmote + `'`},
		{rules.MetricSameColor, `SELECT COUNT(*) FROM event_log visit
			JOIN players target ON target.id = json_extract(visit.payload, '$.target_id')
			JOIN players visitor ON visitor.id = visit.player_id
			WHERE visit.player_id = ?1 AND visit.lan_id = ?2
			AND visit.type = '` + EventFollowChanged + `' AND target.color = visitor.color`},
	}
}

// loadAchievementStats gathers all metrics the catalog can ask for.
func loadAchievementStats(
	ctx context.Context, database querier, input achievementInput,
) (map[rules.Metric]int, error) {
	stats, err := loadCountedMetrics(ctx, database, input)
	if err != nil {
		return nil, err
	}
	stats[rules.MetricSessionHours] = input.sessionHours
	location, err := time.LoadLocation(input.lan.timezone)
	if err != nil {
		return nil, fmt.Errorf("load time zone: %w", err)
	}
	eventTimes, err := loadActionTimes(ctx, database, input, actionEvent)
	if err != nil {
		return nil, err
	}
	stats[rules.MetricEventDays] = rules.CountLANDays(buildLocalMoments(eventTimes, location))
	if !input.isPoke {
		return stats, nil
	}
	pokeTimes, err := loadActionTimes(ctx, database, input, actionPoke)
	if err != nil {
		return nil, err
	}
	moments := buildLocalMoments(pokeTimes, location)
	stats[rules.MetricRestHours] = input.restHours
	stats[rules.MetricPokeDays] = rules.CountLANDays(moments)
	stats[rules.MetricOwlNights] = rules.CountNightsAtHour(moments, rules.NightOwlHour)
	stats[rules.MetricGhostHours] = rules.CountNightsAtHour(moments, rules.GhostHour)
	return stats, nil
}

// buildLocalMoments converts times to the calendar of the LAN for the pure rules.
func buildLocalMoments(times []int64, location *time.Location) []rules.LocalMoment {
	moments := make([]rules.LocalMoment, 0, len(times))
	for _, moment := range times {
		local := time.UnixMilli(moment).In(location)
		date := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
		moments = append(moments, rules.LocalMoment{
			Day: int(date.Unix() / secondsPerDay), Hour: local.Hour(),
		})
	}
	return moments
}

// loadCountedMetrics runs all metric queries as one statement.
func loadCountedMetrics(
	ctx context.Context, database querier, input achievementInput,
) (map[rules.Metric]int, error) {
	queries := listMetricQueries()
	selections := make([]string, 0, len(queries))
	values := make([]int, len(queries))
	targets := make([]any, 0, len(queries))
	for index, metricQuery := range queries {
		selections = append(selections, "("+metricQuery.query+")")
		targets = append(targets, &values[index])
	}
	selectMetricsSQL := "SELECT " + strings.Join(selections, ", ")
	err := database.QueryRowContext(ctx, selectMetricsSQL, input.playerID, input.lan.id).
		Scan(targets...)
	if err != nil {
		return nil, fmt.Errorf("load achievement stats: %w", err)
	}
	stats := map[rules.Metric]int{}
	for index, metricQuery := range queries {
		stats[metricQuery.metric] = values[index]
	}
	return stats, nil
}

// loadActionTimes returns when a player did an action in this LAN.
func loadActionTimes(
	ctx context.Context, database querier, input achievementInput, actionName string,
) ([]int64, error) {
	const selectActionTimesSQL = `SELECT created_at FROM xp_log
		WHERE player_id = ? AND lan_id = ? AND action = ?`
	rows, err := database.QueryContext(ctx, selectActionTimesSQL,
		input.playerID, input.lan.id, actionName)
	if err != nil {
		return nil, fmt.Errorf("load action times: %w", err)
	}
	defer func() { _ = rows.Close() }()
	times := []int64{}
	for rows.Next() {
		var moment int64
		if err := rows.Scan(&moment); err != nil {
			return nil, fmt.Errorf("read action time: %w", err)
		}
		times = append(times, moment)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load action times: %w", err)
	}
	return times, nil
}
