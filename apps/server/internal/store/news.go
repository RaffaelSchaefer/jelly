package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// GatheringNews sends all jellies to the spectators and the presenter to the winner zone, where it
// presents what happened during the last hour.
const GatheringNews = "news"

// News is what the Jelly-News present. A part without news is null or empty.
type News struct {
	TopXP        *NewsXP             `json:"top_xp"`
	Achievements []NewsAchievement   `json:"achievements"`
	TallestStack []int64             `json:"tallest_stack"`
	NextItem     *rules.ScheduleItem `json:"next_item"`
}

// NewsXP names the jelly that earned the most XP.
type NewsXP struct {
	PlayerID int64 `json:"player_id"`
	XP       int64 `json:"xp"`
}

// NewsAchievement names an achievement a jelly earned.
type NewsAchievement struct {
	PlayerID int64  `json:"player_id"`
	Key      string `json:"key"`
}

// isEmpty reports news without anything to present.
func (news News) isEmpty() bool {
	return news.TopXP == nil && len(news.Achievements) == 0 && len(news.TallestStack) == 0 &&
		news.NextItem == nil
}

// listNamedPlayers returns every jelly the news name, so another one presents them.
func (news News) listNamedPlayers() []int64 {
	named := append([]int64{}, news.TallestStack...)
	if news.TopXP != nil {
		named = append(named, news.TopXP.PlayerID)
	}
	for _, achievement := range news.Achievements {
		named = append(named, achievement.PlayerID)
	}
	return named
}

// StartScheduledNews starts the news of the program once their point begins. News without anything
// to present are skipped, and news wait while another gathering runs.
func (store *Store) StartScheduledNews(ctx context.Context, now int64) error {
	queryCtx, cancel := withQueryTimeout(ctx)
	defer cancel()
	lan, err := loadActiveLAN(queryCtx, store.readDB, now)
	if errors.Is(err, ErrNoActiveLAN) {
		return nil
	}
	if err != nil {
		return err
	}
	schedule, startedFor, err := loadNewsSchedule(queryCtx, store.readDB, lan.id)
	if err != nil {
		return err
	}
	item, isDue := rules.FindDueNews(lan.gameRules, schedule, startedFor, now)
	if !isDue {
		return nil
	}
	return store.runInTransaction(ctx, func(transaction *sql.Tx) error {
		running, workErr := loadRunningGathering(ctx, transaction, lan.id, now)
		if workErr != nil || running != nil {
			return workErr
		}
		const markNewsSQL = `UPDATE lans SET news_started_for = ? WHERE id = ?`
		_, workErr = transaction.ExecContext(ctx, markNewsSQL, item.StartsAt, lan.id)
		if workErr != nil {
			return fmt.Errorf("mark news: %w", workErr)
		}
		since := rules.FindNewsWindowStart(schedule, item.StartsAt)
		gathering, workErr := prepareNews(ctx, transaction, lan.id, schedule, since, now)
		if workErr != nil || gathering.News.isEmpty() {
			return workErr
		}
		gathering.EndsAt = rules.CalculateNewsEnd(lan.gameRules, item)
		workErr = writeGathering(ctx, transaction, lan.id, gathering, now)
		if workErr != nil {
			return workErr
		}
		return appendGatheringChanged(ctx, transaction, lan.id, &gathering, now)
	})
}

// loadNewsSchedule reads the program of a LAN with every repeat written out, and the start of its
// last news that began.
func loadNewsSchedule(
	ctx context.Context, database querier, lanID int64,
) ([]rules.ScheduleItem, int64, error) {
	var scheduleJSON string
	var startedFor int64
	const selectNewsScheduleSQL = `SELECT schedule, news_started_for FROM lans WHERE id = ?`
	err := database.QueryRowContext(ctx, selectNewsScheduleSQL, lanID).
		Scan(&scheduleJSON, &startedFor)
	if err != nil {
		return nil, 0, fmt.Errorf("load news schedule: %w", err)
	}
	schedule, err := parseSchedule(scheduleJSON)
	return rules.ExpandSchedule(schedule), startedFor, err
}

// prepareLANNews prepares news a LAN starts by hand, with the next point of its program.
func prepareLANNews(
	ctx context.Context, transaction *sql.Tx, lanID, now int64,
) (Gathering, error) {
	schedule, _, err := loadNewsSchedule(ctx, transaction, lanID)
	if errors.Is(err, sql.ErrNoRows) {
		return Gathering{}, ErrLANNotFound
	}
	if err != nil {
		return Gathering{}, err
	}
	since := rules.FindNewsWindowStart(schedule, now)
	return prepareNews(ctx, transaction, lanID, schedule, since, now)
}

// prepareNews collects the news since `since` and picks who presents them.
func prepareNews(
	ctx context.Context, transaction *sql.Tx, lanID int64, schedule []rules.ScheduleItem,
	since, now int64,
) (Gathering, error) {
	news, err := collectNews(ctx, transaction, lanID, since)
	if err != nil {
		return Gathering{}, err
	}
	next, found := rules.FindNextScheduleItem(schedule, now)
	if found {
		news.NextItem = &next
	}
	presenterID, err := pickPresenter(ctx, transaction, lanID, now, news.listNamedPlayers())
	if err != nil {
		return Gathering{}, err
	}
	return Gathering{
		Kind: GatheringNews, WinnerID: nil, EndsAt: 0, PresenterID: presenterID, News: &news,
	}, nil
}

// collectNews reads what visible jellies did since `since`.
func collectNews(ctx context.Context, database querier, lanID, since int64) (News, error) {
	news := News{
		TopXP: nil, Achievements: []NewsAchievement{}, TallestStack: []int64{},
		NextItem: nil,
	}
	var err error
	news.TopXP, err = loadTopXP(ctx, database, lanID, since)
	if err != nil {
		return News{}, err
	}
	news.Achievements, err = loadNewAchievements(ctx, database, lanID, since)
	if err != nil {
		return News{}, err
	}
	stacks, err := loadStackMembersSince(ctx, database, lanID, since)
	if err != nil {
		return News{}, err
	}
	news.TallestStack = rules.FindTallestStack(stacks)
	return news, nil
}

// loadTopXP returns the visible jelly with the most XP since `since`, or nil.
func loadTopXP(ctx context.Context, database querier, lanID, since int64) (*NewsXP, error) {
	var top NewsXP
	const selectTopXPSQL = `SELECT x.player_id, SUM(x.xp) AS total FROM xp_log x
		JOIN players p ON p.id = x.player_id
		WHERE x.lan_id = ? AND x.created_at > ? AND p.hidden_at IS NULL
		GROUP BY x.player_id HAVING total > 0 ORDER BY total DESC, x.player_id LIMIT 1`
	err := database.QueryRowContext(ctx, selectTopXPSQL, lanID, since).Scan(&top.PlayerID, &top.XP)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil //nolint:nilnil // Nobody earning XP is a normal hour, not an error.
	}
	if err != nil {
		return nil, fmt.Errorf("load top xp: %w", err)
	}
	return &top, nil
}

// loadNewAchievements returns the newest achievements visible jellies of the LAN earned.
func loadNewAchievements(
	ctx context.Context, database querier, lanID, since int64,
) ([]NewsAchievement, error) {
	const selectNewAchievementsSQL = `SELECT a.player_id, a.key FROM achievements a
		JOIN lan_entries e ON e.player_id = a.player_id AND e.lan_id = ?
		JOIN players p ON p.id = a.player_id
		WHERE a.earned_at > ? AND p.hidden_at IS NULL
		ORDER BY a.earned_at DESC, a.player_id LIMIT ?`
	rows, err := database.QueryContext(ctx, selectNewAchievementsSQL,
		lanID, since, rules.NewsMaxAchievements)
	if err != nil {
		return nil, fmt.Errorf("load new achievements: %w", err)
	}
	defer func() { _ = rows.Close() }()
	achievements := []NewsAchievement{}
	for rows.Next() {
		var achievement NewsAchievement
		err = rows.Scan(&achievement.PlayerID, &achievement.Key)
		if err != nil {
			return nil, fmt.Errorf("read new achievement: %w", err)
		}
		achievements = append(achievements, achievement)
	}
	err = rows.Err()
	if err != nil {
		return nil, fmt.Errorf("read new achievements: %w", err)
	}
	return achievements, nil
}

// loadStackMembersSince returns the members of every stack the stage saw since `since`.
func loadStackMembersSince(
	ctx context.Context, database querier, lanID, since int64,
) ([][]int64, error) {
	const selectStackEventsSQL = `SELECT payload FROM event_log
		WHERE lan_id = ? AND type = ? AND created_at > ?`
	rows, err := database.QueryContext(ctx, selectStackEventsSQL, lanID, EventStackChanged, since)
	if err != nil {
		return nil, fmt.Errorf("load stack events: %w", err)
	}
	defer func() { _ = rows.Close() }()
	stacks := [][]int64{}
	for rows.Next() {
		var payload string
		err = rows.Scan(&payload)
		if err != nil {
			return nil, fmt.Errorf("read stack event: %w", err)
		}
		var stack struct {
			MemberIDs []int64 `json:"member_ids"`
		}
		// A stack that fell apart only names its id, which leaves the members empty.
		err = json.Unmarshal([]byte(payload), &stack)
		if err != nil {
			return nil, fmt.Errorf("read stack event: %w", err)
		}
		stacks = append(stacks, stack.MemberIDs)
	}
	err = rows.Err()
	if err != nil {
		return nil, fmt.Errorf("read stack events: %w", err)
	}
	return stacks, nil
}

// pickPresenter picks a present, visible jelly at random, one the news do not name if possible.
// Without anybody present the news have no presenter.
func pickPresenter(
	ctx context.Context, database querier, lanID, now int64, named []int64,
) (*int64, error) {
	gameRules, err := loadLANRules(ctx, database, lanID)
	if err != nil {
		return nil, err
	}
	namedJSON, err := json.Marshal(named)
	if err != nil {
		return nil, fmt.Errorf("encode named players: %w", err)
	}
	var presenterID int64
	presentSince := now - gameRules.PresenceWindowSeconds*millisPerSecond
	const selectPresenterSQL = `SELECT e.player_id FROM lan_entries e
		JOIN players p ON p.id = e.player_id
		WHERE e.lan_id = ? AND e.last_seen_at > ? AND p.hidden_at IS NULL
		ORDER BY e.player_id IN (SELECT value FROM json_each(?)), random() LIMIT 1`
	err = database.QueryRowContext(ctx, selectPresenterSQL, lanID, presentSince, string(namedJSON)).
		Scan(&presenterID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil //nolint:nilnil // An empty hall has nobody to present, which is fine.
	}
	if err != nil {
		return nil, fmt.Errorf("pick presenter: %w", err)
	}
	return &presenterID, nil
}

// encodeNews turns news into the stored JSON, and no news into NULL.
func encodeNews(news *News) (sql.NullString, error) {
	if news == nil {
		return sql.NullString{String: "", Valid: false}, nil
	}
	encoded, err := json.Marshal(news)
	if err != nil {
		return sql.NullString{}, fmt.Errorf("encode news: %w", err)
	}
	return sql.NullString{String: string(encoded), Valid: true}, nil
}

// decodeNews reads stored news, NULL for every gathering but news.
func decodeNews(stored sql.NullString) (*News, error) {
	if !stored.Valid {
		return nil, nil //nolint:nilnil // Only news carry news.
	}
	var news News
	err := json.Unmarshal([]byte(stored.String), &news)
	if err != nil {
		return nil, fmt.Errorf("decode news: %w", err)
	}
	return &news, nil
}
