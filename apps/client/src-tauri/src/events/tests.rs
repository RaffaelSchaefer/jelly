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
    let trip = json!({ "x": 10.0, "y": 20.0, "ends_at": 1000 });
    assert!(is_own_event(
        &event("trip.changed", Some(7), trip.clone()),
        7
    ));
    assert!(!is_own_event(&event("trip.changed", Some(8), trip), 7));
}

#[test]
fn coins_and_purchases_reach_their_own_jelly() {
    let coins = json!({ "amount": 2, "source": "admin" });
    assert!(is_own_event(
        &event("coins.gained", Some(7), coins.clone()),
        7
    ));
    assert!(!is_own_event(&event("coins.gained", Some(8), coins), 7));
    let bought = json!({ "key": "beanie", "price": 2 });
    assert!(is_own_event(
        &event("cosmetic.purchased", Some(7), bought.clone()),
        7
    ));
    assert!(!is_own_event(
        &event("cosmetic.purchased", Some(8), bought),
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
            json!({ "id": 1, "key": "hop", "from_id": from, "partner_id": partner,
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

#[test]
fn map_and_shop_close_for_a_new_invite_and_for_the_duet() {
    let invite = |state: &str| {
        event(
            PARTNER_INVITE,
            Some(7),
            json!({ "id": 1, "key": "hop", "from_id": 7, "partner_id": 8, "state": state }),
        )
    };
    assert!(closes_popouts(&invite("pending"), 8));
    assert!(
        !closes_popouts(&invite("pending"), 7),
        "wer auffordert, wartet"
    );
    assert!(!closes_popouts(&invite("pending"), 9));
    assert!(!closes_popouts(&invite("declined"), 8));

    let duet = event(
        PARTNER_EMOTE,
        Some(8),
        json!({ "key": "hop", "partner_id": 7 }),
    );
    assert!(closes_popouts(&duet, 7));
    assert!(
        !closes_popouts(&duet, 8),
        "wer annimmt, hat keine Karte mehr offen"
    );
    assert!(!closes_popouts(&event("xp.gained", Some(7), json!({})), 7));
}

#[test]
fn changed_rules_reach_everyone() {
    let rules = event("rules.changed", None, json!({}));
    assert!(is_own_event(&rules, 7));
}

/// Ein Stapel nach dem Hinaufklettern von `by`.
fn climbed(by: i64, members: &[i64]) -> ServerEvent {
    event(
        STACK_CHANGED,
        Some(by),
        json!({ "id": 4, "x": 10.0, "y": 20.0, "ends_at": 1000, "member_ids": members }),
    )
}

/// Ein Stapel, von dem `by` abgestiegen ist, oder ohne `by` auseinandergefallen.
fn left(by: Option<i64>) -> ServerEvent {
    event(STACK_CHANGED, by, json!({ "id": 4 }))
}

#[test]
fn the_own_stack_reaches_the_pet_until_the_jelly_is_off_it() {
    let mut own = OwnStack::default();
    assert!(own.track(&climbed(7, &[7]), 7), "selbst begonnen");
    assert!(own.track(&climbed(8, &[7, 8]), 7), "jemand klettert drauf");
    assert!(own.track(&left(Some(8)), 7), "jemand steigt ab");
    assert!(
        own.track(&climbed(9, &[7, 9]), 7),
        "das Jelly steht noch oben"
    );
    assert!(own.track(&left(Some(7)), 7), "selbst abgestiegen");
    assert!(
        !own.track(&left(Some(9)), 7),
        "danach ist es ein fremder Stapel"
    );
}

#[test]
fn a_stack_that_falls_apart_is_forgotten() {
    let mut own = OwnStack::default();
    assert!(own.track(&climbed(7, &[8, 7]), 7));
    assert!(own.track(&left(None), 7));
    assert!(!own.track(&climbed(9, &[8, 9]), 7));
}

#[test]
fn other_stacks_stay_away_from_the_pet() {
    let mut own = OwnStack::default();
    assert!(!own.track(&climbed(8, &[8]), 7));
    assert!(!own.track(&left(Some(8)), 7));
    assert!(!own.track(&left(None), 7));
    assert!(!is_own_event(&climbed(7, &[7]), 8));
}

#[test]
fn climbing_down_reaches_the_pet_even_from_a_stack_the_stream_missed() {
    let mut own = OwnStack::default();
    assert!(own.track(&left(Some(7)), 7));
    assert!(!own.track(&event("xp.gained", Some(7), json!({ "id": 4 })), 7));
}
