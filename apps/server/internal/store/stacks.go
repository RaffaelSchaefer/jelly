package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/RaffaelSchaefer/jelly/apps/server/internal/rules"
)

// Stack is a tower of jellies at one spot. `MemberIDs` go from the bottom to the top.
type Stack struct {
	ID        int64   `json:"id"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	EndsAt    int64   `json:"ends_at"`
	MemberIDs []int64 `json:"member_ids"`
}

// StackAnswer is a stack after a change, with the player who changed it.
type StackAnswer struct {
	Stack Stack       `json:"stack"`
	Me    PlayerState `json:"me"`
}

// StartStack starts a new stack at this point with the player at the bottom.
func (store *Store) StartStack(
	ctx context.Context, playerID int64, point rules.StagePoint, now int64,
) (StackAnswer, error) {
	var answer StackAnswer
	var err error
	answer.Me, err = store.runPlayerAction(
		ctx,
		playerID,
		now,
		false,
		func(action actionContext) error {
			const insertStackSQL = `INSERT INTO stacks (lan_id, x, y, ends_at) VALUES (?, ?, ?, ?)`
			inserted, workErr := action.transaction.ExecContext(ctx, insertStackSQL, action.lan.id,
				point.X, point.Y, rules.CalculateStackEnd(action.lan.gameRules, now))
			if workErr != nil {
				return fmt.Errorf("insert stack: %w", workErr)
			}
			stackID, workErr := inserted.LastInsertId()
			if workErr != nil {
				return fmt.Errorf("read stack ID: %w", workErr)
			}
			answer.Stack, workErr = addStackMember(ctx, action, stackID)
			return workErr
		},
	)
	if err != nil {
		return StackAnswer{}, err
	}
	return answer, nil
}

// StackJoin is a jelly climbing a stack.
type StackJoin struct {
	PlayerID int64
	StackID  int64
	Now      int64
	// IsNear says whether the jelly stands within this distance of the point.
	IsNear func(point rules.StagePoint, reach float64) bool
}

// JoinStack puts a jelly on top of a running stack nearby.
func (store *Store) JoinStack(ctx context.Context, join StackJoin) (StackAnswer, error) {
	var answer StackAnswer
	var err error
	answer.Me, err = store.runPlayerAction(ctx, join.PlayerID, join.Now, false,
		func(action actionContext) error {
			stack, workErr := loadRunningStack(ctx, action, join.StackID)
			if workErr != nil {
				return workErr
			}
			if rules.IsStackFull(action.lan.gameRules, len(stack.MemberIDs)) {
				return ErrStackFull
			}
			point := rules.StagePoint{X: stack.X, Y: stack.Y}
			if !join.IsNear(point, action.lan.gameRules.NearDistance) {
				return ErrTooFar
			}
			answer.Stack, workErr = addStackMember(ctx, action, join.StackID)
			return workErr
		})
	if err != nil {
		return StackAnswer{}, err
	}
	return answer, nil
}

// LeaveStack takes a jelly off its stack. Those above it move down.
func (store *Store) LeaveStack(ctx context.Context, playerID, now int64) (PlayerState, error) {
	return store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		return removeStackMember(ctx, action)
	})
}

// addStackMember puts the player on top of a stack, and off any stack it stood on. A trip or
// following ends, because the jelly now stands here.
func addStackMember(ctx context.Context, action actionContext, stackID int64) (Stack, error) {
	err := removeStackMember(ctx, action)
	if err != nil {
		return Stack{}, err
	}
	const insertMemberSQL = `INSERT INTO stack_members (stack_id, player_id) VALUES (?, ?)`
	_, err = action.transaction.ExecContext(ctx, insertMemberSQL, stackID, action.playerID)
	if err != nil {
		return Stack{}, fmt.Errorf("insert stack member: %w", err)
	}
	err = endWalks(ctx, action)
	if err != nil {
		return Stack{}, err
	}
	stack, err := loadRunningStack(ctx, action, stackID)
	if err != nil {
		return Stack{}, err
	}
	return stack, appendVisibleEvent(ctx, action, EventStackChanged, stack)
}

// removeStackMember takes the player off its stack and deletes a stack that is empty afterwards.
func removeStackMember(ctx context.Context, action actionContext) error {
	var stackID int64
	const selectOwnStackSQL = `SELECT stack_id FROM stack_members WHERE player_id = ?`
	err := action.transaction.QueryRowContext(ctx, selectOwnStackSQL, action.playerID).
		Scan(&stackID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load own stack: %w", err)
	}
	const deleteMemberSQL = `DELETE FROM stack_members WHERE player_id = ?`
	_, err = action.transaction.ExecContext(ctx, deleteMemberSQL, action.playerID)
	if err != nil {
		return fmt.Errorf("delete stack member: %w", err)
	}
	const deleteEmptyStackSQL = `DELETE FROM stacks WHERE id = ?1
		AND NOT EXISTS (SELECT 1 FROM stack_members WHERE stack_id = ?1)`
	_, err = action.transaction.ExecContext(ctx, deleteEmptyStackSQL, stackID)
	if err != nil {
		return fmt.Errorf("delete empty stack: %w", err)
	}
	return appendVisibleEvent(
		ctx,
		action,
		EventStackChanged,
		map[string]int64{payloadStackID: stackID},
	)
}

// loadRunningStack returns a stack of this LAN whose time is not over.
func loadRunningStack(ctx context.Context, action actionContext, stackID int64) (Stack, error) {
	stack := Stack{ID: stackID, X: 0, Y: 0, EndsAt: 0, MemberIDs: []int64{}}
	const selectStackSQL = `SELECT x, y, ends_at FROM stacks
		WHERE id = ? AND lan_id = ? AND ends_at > ?`
	err := action.transaction.QueryRowContext(ctx, selectStackSQL,
		stackID, action.lan.id, action.now).Scan(&stack.X, &stack.Y, &stack.EndsAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Stack{}, ErrStackNotFound
	}
	if err != nil {
		return Stack{}, fmt.Errorf("load stack: %w", err)
	}
	stack.MemberIDs, err = listStackMembers(ctx, action.transaction, stackID)
	return stack, err
}

// listStackMembers returns the jellies of a stack from the bottom to the top.
func listStackMembers(ctx context.Context, database querier, stackID int64) ([]int64, error) {
	const selectMembersSQL = `SELECT player_id FROM stack_members WHERE stack_id = ? ORDER BY id`
	rows, err := database.QueryContext(ctx, selectMembersSQL, stackID)
	if err != nil {
		return nil, fmt.Errorf("list stack members: %w", err)
	}
	defer func() { _ = rows.Close() }()
	members := []int64{}
	for rows.Next() {
		var playerID int64
		if err := rows.Scan(&playerID); err != nil {
			return nil, fmt.Errorf("read stack member: %w", err)
		}
		members = append(members, playerID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list stack members: %w", err)
	}
	return members, nil
}

// loadRunningStacks returns all stacks of a LAN whose time is not over.
func loadRunningStacks(
	ctx context.Context, database querier, lanID, now int64,
) ([]Stack, error) {
	const selectStacksSQL = `SELECT id, x, y, ends_at FROM stacks
		WHERE lan_id = ? AND ends_at > ? ORDER BY id`
	rows, err := database.QueryContext(ctx, selectStacksSQL, lanID, now)
	if err != nil {
		return nil, fmt.Errorf("load stacks: %w", err)
	}
	defer func() { _ = rows.Close() }()
	stacks := []Stack{}
	for rows.Next() {
		var stack Stack
		err = rows.Scan(&stack.ID, &stack.X, &stack.Y, &stack.EndsAt)
		if err != nil {
			return nil, fmt.Errorf("read stack: %w", err)
		}
		stacks = append(stacks, stack)
	}
	err = rows.Err()
	if err != nil {
		return nil, fmt.Errorf("load stacks: %w", err)
	}
	// Read after the rows are done, so a small pool cannot wait for itself.
	_ = rows.Close()
	for index := range stacks {
		stacks[index].MemberIDs, err = listStackMembers(ctx, database, stacks[index].ID)
		if err != nil {
			return nil, err
		}
	}
	return stacks, nil
}

// ApplyHighlight lets a jelly light up on the stage so others can find it. A jelly on top of a
// stack makes it a lighthouse, and everyone on that stack earns it.
func (store *Store) ApplyHighlight(
	ctx context.Context, playerID, targetID, now int64,
) (PlayerState, error) {
	return store.runPlayerAction(ctx, playerID, now, false, func(action actionContext) error {
		lastAt, err := loadLastEventTime(ctx, action.transaction, playerID, EventHighlight)
		if err != nil {
			return err
		}
		if !rules.IsHighlightAllowed(action.lan.gameRules, lastAt, now) {
			return ErrHighlightCooldown
		}
		err = requireVisibleJelly(ctx, action, targetID, ErrInvalidHighlight)
		if err != nil {
			return err
		}
		err = appendVisibleEvent(ctx, action, EventHighlight, map[string]any{
			payloadTargetID: targetID,
			"ends_at":       rules.CalculateHighlightEnd(action.lan.gameRules, now),
			"cosmetic_key":  rules.CosmeticHighlightAura,
		})
		if err != nil {
			return err
		}
		return grantLighthouse(ctx, action, targetID)
	})
}

// grantLighthouse rewards everyone on a stack whose top jelly was highlighted.
func grantLighthouse(ctx context.Context, action actionContext, targetID int64) error {
	var stackID int64
	const selectStackOfTargetSQL = `SELECT m.stack_id FROM stack_members m
		JOIN stacks s ON s.id = m.stack_id
		WHERE m.player_id = ? AND s.lan_id = ? AND s.ends_at > ?`
	err := action.transaction.QueryRowContext(ctx, selectStackOfTargetSQL,
		targetID, action.lan.id, action.now).Scan(&stackID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load stack of target: %w", err)
	}
	members, err := listStackMembers(ctx, action.transaction, stackID)
	if err != nil {
		return err
	}
	if len(members) < lighthouseMembers || members[len(members)-1] != targetID {
		return nil
	}
	for _, memberID := range members {
		err = grantLighthouseTo(ctx, action, memberID)
		if err != nil {
			return err
		}
	}
	target, err := loadOtherPlayerAction(ctx, action, targetID)
	if err != nil {
		return err
	}
	return grantAchievementOnce(ctx, target, rules.AchievementLighthouseLight)
}

// grantLighthouseTo rewards one jelly on a lighthouse.
func grantLighthouseTo(ctx context.Context, action actionContext, memberID int64) error {
	member, err := loadOtherPlayerAction(ctx, action, memberID)
	if err != nil {
		return err
	}
	return grantAchievementOnce(ctx, member, rules.AchievementLighthouse)
}
