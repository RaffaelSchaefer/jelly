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
    // Der Zeitplan gilt allen, Karte und Shop bleiben dabei offen.
    let schedule = event("schedule.changed", None, json!({}));
    assert!(is_own_event(&schedule, 7));
    assert!(!closes_popouts(&schedule, 7));
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

#[test]
fn the_wizard_hat_reaches_everyone_and_keeps_map_and_shop_open() {
    let payload = json!({ "holder_id": 8, "holder_name": "Mo", "ends_at": 1000, "worn": true });
    let stolen = event(WIZARD_HAT_CHANGED, Some(8), payload);
    for player_id in [7, 8, 9] {
        assert!(is_own_event(&stolen, player_id));
        assert!(!closes_popouts(&stolen, player_id));
    }
    let back = event(
        WIZARD_HAT_CHANGED,
        Some(8),
        json!({ "holder_id": 8, "holder_name": "Mo", "ends_at": 1000, "worn": false }),
    );
    assert!(is_own_event(&back, 7));
}

/// Ein `gathering.changed` mit diesem Gathering, `null` an seinem Ende.
fn gathering(payload: Value) -> ServerEvent {
    event(GATHERING_CHANGED, None, payload)
}

/// Der Beginn von Jelly-News mit `ends_at` am Ende.
fn news_start(ends_at: i64) -> ServerEvent {
    gathering(json!({
        "kind": "news", "winner_id": null, "ends_at": ends_at, "presenter_id": 8,
        "news": { "top_xp": { "player_id": 9, "xp": 120 }, "achievements": [],
            "tallest_stack": [], "next_item": null }
    }))
}

/// Gatherings, die keine News beginnen: andere Arten, Unlesbares und das Ende.
fn other_gatherings() -> [ServerEvent; 5] {
    [
        gathering(json!({ "kind": "food", "winner_id": null, "ends_at": 1000 })),
        gathering(json!({ "kind": "ceremony", "winner_id": 7, "ends_at": 1000 })),
        gathering(json!({ "kind": 1, "ends_at": 1000 })),
        gathering(Value::Null),
        gathering(json!({})),
    ]
}

#[test]
fn the_news_reach_everyone_and_keep_map_and_shop_open() {
    for player_id in [7, 8, 9] {
        let mut on_air = NewsOnAir::default();
        assert!(on_air.track(&news_start(1000)));
        assert!(!closes_popouts(&news_start(1000), player_id));
        assert!(
            !is_own_event(&news_start(1000), player_id),
            "nur über NewsOnAir"
        );
    }
    let without_presenter = gathering(json!({ "kind": "news", "ends_at": 1000 }));
    assert!(
        NewsOnAir::default().track(&without_presenter),
        "ein älterer Server ohne Vorleser"
    );
}

#[test]
fn other_gatherings_stay_away_from_the_pet_without_news() {
    let mut on_air = NewsOnAir::default();
    for other in other_gatherings() {
        assert!(!on_air.track(&other), "{:?}", other.payload);
        assert!(!is_own_event(&other, 7));
        assert!(!closes_popouts(&other, 7));
    }
    assert!(!on_air.track(&event("xp.gained", Some(7), json!({}))));
}

#[test]
fn the_end_of_running_news_reaches_the_pet_once() {
    for end in other_gatherings() {
        let mut on_air = NewsOnAir::default();
        assert!(on_air.track(&news_start(1000)));
        assert!(on_air.track(&end), "Ende oder Ersatz: {:?}", end.payload);
        assert!(!on_air.track(&end), "danach wieder draußen");
    }
    let mut on_air = NewsOnAir::default();
    assert!(on_air.track(&news_start(1000)));
    assert!(on_air.track(&news_start(2000)), "neue News ersetzen alte");
    assert!(!on_air.track(&event("xp.gained", Some(7), json!({}))));
    assert!(
        on_air.track(&gathering(Value::Null)),
        "andere Ereignisse ändern nichts"
    );
}

/// Ein Stapel, der weiter steht, nachdem `by` hinauf- oder abgestiegen ist.
fn climbed(by: i64, members: &[i64]) -> ServerEvent {
    event(
        STACK_CHANGED,
        Some(by),
        json!({ "id": 4, "x": 10.0, "y": 20.0, "ends_at": 1000, "member_ids": members }),
    )
}

/// Ein Stapel, der weg ist: `by` stieg als letztes ab, oder ohne `by` ist seine Zeit um.
fn left(by: Option<i64>) -> ServerEvent {
    event(STACK_CHANGED, by, json!({ "id": 4 }))
}

#[test]
fn the_own_stack_reaches_the_pet_until_the_jelly_is_off_it() {
    let mut own = OwnStack::default();
    assert!(own.track(&climbed(7, &[7]), 7), "selbst begonnen");
    assert!(own.track(&climbed(8, &[7, 8]), 7), "jemand klettert drauf");
    assert!(own.track(&climbed(8, &[7]), 7), "jemand steigt ab");
    assert!(own.track(&climbed(9, &[7, 9]), 7), "wieder jemand drauf");
    assert!(own.track(&climbed(7, &[9]), 7), "selbst abgestiegen");
    assert!(
        !own.track(&climbed(9, &[]), 7) && !own.track(&left(Some(9)), 7),
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

/// `follower` stellt sich zu `target`, oder geht mit `None` wieder.
fn followed(follower: i64, target: Option<i64>) -> ServerEvent {
    event(
        FOLLOW_CHANGED,
        Some(follower),
        json!({ "target_id": target }),
    )
}

#[test]
fn follows_in_the_own_line_reach_the_pet() {
    let mut follows = Follows::default();
    assert!(
        follows.track(&followed(7, Some(1)), 7),
        "selbst dazugestellt"
    );
    assert!(follows.track(&followed(8, Some(1)), 7), "noch wer am Ziel");
    assert!(
        follows.track(&followed(9, Some(8)), 7),
        "wer folgt, dem folgt wer"
    );
    assert!(
        follows.track(&followed(1, Some(2)), 7),
        "das Ziel folgt selbst"
    );
    assert!(
        follows.track(&followed(9, None), 7),
        "wer geht, war noch dabei"
    );
    assert!(
        !follows.track(&followed(9, Some(5)), 7),
        "danach ist er fremd"
    );
    assert!(
        follows.track(&followed(9, Some(7)), 7),
        "wer sich zum eigenen Jelly stellt"
    );
}

#[test]
fn a_follow_that_moves_away_reaches_the_pet_once() {
    let mut follows = Follows::of([(7, 1), (8, 1)]);
    assert!(
        follows.track(&followed(8, Some(5)), 7),
        "war noch verbunden"
    );
    assert!(!follows.track(&followed(8, None), 7));
    assert!(follows.track(&followed(7, None), 7), "das eigene Ende");
    assert!(
        !follows.track(&followed(8, Some(1)), 7),
        "das Ziel von früher"
    );
}

#[test]
fn other_follows_stay_away_from_the_pet() {
    let mut follows = Follows::of([(3, 4)]);
    assert!(!follows.track(&followed(5, Some(4)), 7));
    assert!(!follows.track(&followed(3, None), 7));
    assert!(!follows.track(&followed(5, None), 7));
    assert!(!follows.track(&event("xp.gained", Some(5), json!({})), 7));
    assert!(!follows.track(&event(FOLLOW_CHANGED, None, json!({})), 7));
}

#[test]
fn follows_from_the_stage_count_from_the_start() {
    let mut follows = Follows::of([(8, 7), (9, 8)]);
    assert!(
        follows.track(&followed(9, None), 7),
        "das Ende der Polonaise von vor dem Stream"
    );
    assert!(!follows.track(&followed(9, Some(3)), 7));
}
