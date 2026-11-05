//! Tests für die Auswahl der Ereignisse, ohne Netz.

use serde_json::json;

use super::*;

/// Ein Ereignis, wie es im Stream ankommt.
fn event(kind: &str, player_id: Option<i64>, payload: Value) -> ServerEvent {
    ServerEvent {
        id: 1,
        kind: kind.to_owned(),
        player_id,
        payload,
        created_at: 0,
    }
}

#[test]
fn only_own_progress_passes() {
    assert!(is_own_event(&event("xp.gained", Some(7), json!({})), 7));
    assert!(!is_own_event(&event("xp.gained", Some(8), json!({})), 7));
    assert!(!is_own_event(&event("emote", Some(7), json!({})), 7));
    assert!(!is_own_event(&event("sign.changed", Some(7), json!({})), 7));
    let walked_away = json!({ "target_id": null });
    assert!(is_own_event(
        &event("follow.changed", Some(7), walked_away.clone()),
        7
    ));
    assert!(!is_own_event(
        &event("follow.changed", Some(8), walked_away),
        7
    ));
}

#[test]
fn a_removed_player_is_read_from_the_payload() {
    let removed = |id| event(PLAYER_REMOVED, None, json!({ "player_id": id }));
    assert!(is_own_event(&removed(7), 7));
    assert!(!is_own_event(&removed(8), 7));
}

#[test]
fn a_partner_emote_reaches_only_who_started_it() {
    let joined = |partner| {
        event(
            PARTNER_EMOTE,
            Some(8),
            json!({ "key": "hop", "partner_id": partner }),
        )
    };
    assert!(is_own_event(&joined(7), 7));
    assert!(!is_own_event(&joined(9), 7));
    assert!(!is_own_event(&joined(7), 8));
}

#[test]
fn an_invite_reaches_both_sides_and_nobody_else() {
    let invite = |from: i64, partner: i64| {
        event(
            PARTNER_INVITE,
            Some(from),
            json!({ "id": 1, "key": "hop", "from_id": from, "partner_ids": [partner],
                "state": "pending", "expires_at": 0 }),
        )
    };
    assert!(is_own_event(&invite(7, 8), 7));
    assert!(is_own_event(&invite(7, 8), 8));
    assert!(!is_own_event(&invite(7, 8), 9));
}

#[test]
fn moves_and_resets_are_told_apart_from_events() {
    let walk = r#"{"player_id":1,"kind":"wander","start_at":5,"level":0,
        "points":[{"x":1.5,"y":2,"t":0}]}"#;
    assert!(matches!(
        parse_message(MOVE_MESSAGE, walk),
        StreamMessage::Move(walk) if walk.player_id == 1 && walk.points[0].x == 1.5
    ));
    assert!(matches!(
        parse_message(RESET_MESSAGE, "{}"),
        StreamMessage::Reset
    ));
    let xp = r#"{"id":7,"type":"xp.gained","player_id":1,"payload":{},"created_at":1}"#;
    assert!(matches!(
        parse_message("xp.gained", xp),
        StreamMessage::Event(event) if event.kind == "xp.gained"
    ));
}

#[test]
fn messages_from_a_newer_server_are_skipped() {
    assert!(matches!(
        parse_message("something.new", "{}"),
        StreamMessage::Other
    ));
    assert!(matches!(
        parse_message(MOVE_MESSAGE, "broken"),
        StreamMessage::Other
    ));
}
