//! Tests für den Vertrag mit dem Server, ohne Netz.

use super::*;
use crate::pet::Color;

#[test]
fn server_errors_show_their_message() {
    let body = r#"{"error":{"code":"name_taken","message":"Dieser Name ist schon vergeben."}}"#;
    let error = parse_error(StatusCode::CONFLICT, body);
    assert!(matches!(&error, Error::Server { code, .. } if code == "name_taken"));
    assert_eq!(
        serde_json::to_value(&error).unwrap(),
        "Dieser Name ist schon vergeben."
    );
}

#[test]
fn a_profile_patch_only_sends_what_changes() {
    let patch = Profile {
        color: Some(Color::Peach),
        ..Profile::default()
    };
    assert_eq!(
        serde_json::to_value(&patch).unwrap(),
        serde_json::json!({ "color": "peach" })
    );
}

#[test]
fn unauthorized_and_foreign_answers_are_recognised() {
    assert!(matches!(
        parse_error(StatusCode::UNAUTHORIZED, ""),
        Error::Unauthorized
    ));
    let proxy = parse_error(StatusCode::BAD_GATEWAY, "<html>bad gateway</html>");
    assert!(matches!(&proxy, Error::Server { code, .. } if code == "unknown"));
}

#[test]
fn player_state_from_the_docs_parses_and_ignores_new_fields() {
    // Beispiel aus `apps/server/docs/api.md`, dazu ein Feld, das es noch nicht gibt.
    let body = r##"{
      "server_time": 1795000000000, "last_event_id": 42, "id": 1, "name": "Glibber",
      "color": "mint", "equipped": { "head": { "key": "beanie", "color": "#4cc9f0" } },
      "hidden": false,
      "lan": { "slug": "ucb-2026", "name": "UCB LAN 2026", "active": true },
      "xp": 3, "level": 1, "total_xp": 3, "next_poke_at": 1795000900000,
      "reports": { "food_ready_at": 0, "drink_ready_at": 0, "reports_left": 8 },
      "sign": null, "follow": { "player_id": 2, "ends_at": 1795000900000 },
      "trip": { "x": 12.5, "y": 40, "ends_at": 1795000300000 }, "lans_attended": 1,
      "badges": [{ "slug": "ucb-2026", "name": "UCB LAN 2026" }], "cosmetics": [],
      "achievements": [{ "key": "hatched", "title": "Frisch geschlüpft", "lan_slug": null,
        "earned_at": 1795000000000 }],
      "awards": [], "future_field": true
    }"##;
    let me: Me = serde_json::from_str(body).unwrap();
    assert_eq!(me.next_poke_at, Some(1_795_000_900_000));
    assert_eq!(me.reports.unwrap().reports_left, 8);
    assert_eq!(me.achievements[0].best, None);
    assert_eq!(me.equipped["head"].key, "beanie");
    assert_eq!(me.equipped["head"].color.as_deref(), Some("#4cc9f0"));
    assert_eq!(me.follow.unwrap().ends_at, 1_795_000_900_000);
    assert_eq!(me.trip.unwrap().ends_at, 1_795_000_300_000);
}

#[test]
fn redeeming_a_code_only_sends_what_a_new_account_needs() {
    let restore = AccessBody {
        code: "ABCD",
        name: None,
        color: None,
    };
    assert_eq!(
        serde_json::to_value(&restore).unwrap(),
        json!({ "code": "ABCD" })
    );
    let create = AccessBody {
        code: "ABCD",
        name: Some("Glibber"),
        color: Some(Color::Mint),
    };
    assert_eq!(
        serde_json::to_value(&create).unwrap(),
        json!({ "code": "ABCD", "name": "Glibber", "color": "mint" })
    );
}

#[test]
fn an_empty_slot_sends_no_key() {
    let empty = EquipBody {
        slot: "head".into(),
        key: None,
        color: None,
    };
    assert_eq!(
        serde_json::to_value(&empty).unwrap(),
        json!({ "slot": "head" })
    );
}

#[test]
fn a_partner_invite_from_the_docs_parses() {
    let body = r#"{
      "partner_emote": { "id": 3, "key": "hop", "from_id": 1, "partner_id": 2,
        "state": "accepted", "expires_at": 1795000120000 },
      "xp_gained": 5,
      "me": {
        "server_time": 1, "last_event_id": 2, "id": 2, "name": "Blubb", "color": "peach",
        "equipped": {}, "hidden": false, "lan": null, "xp": 0, "level": 1, "total_xp": 0,
        "next_poke_at": null, "reports": null, "sign": null, "follow": null,
        "trip": null, "lans_attended": 0, "badges": [], "cosmetics": [],
        "achievements": [], "awards": []
      }
    }"#;
    let result: PartnerInviteResult = serde_json::from_str(body).unwrap();
    assert_eq!(result.partner_emote.partner_id, 2);
    assert_eq!(result.xp_gained, 5);
    assert_eq!(result.me.id, 2);
}

#[test]
fn events_keep_their_type_name() {
    let body = r#"{"id":7,"type":"xp.gained","player_id":1,"payload":{"amount":3},"created_at":1}"#;
    let event: ServerEvent = serde_json::from_str(body).unwrap();
    assert_eq!(event.kind, "xp.gained");
    assert_eq!(serde_json::to_value(&event).unwrap()["type"], "xp.gained");
}

#[test]
fn emote_errors_keep_the_server_message() {
    for (status, code, message) in [
        (
            StatusCode::CONFLICT,
            "emote_cooldown",
            "Warte kurz bis zum nächsten Emote.",
        ),
        (
            StatusCode::BAD_REQUEST,
            "unknown_emote",
            "Dieses Emote gibt es nicht.",
        ),
    ] {
        let body = json!({ "error": { "code": code, "message": message } }).to_string();
        let error = parse_error(status, &body);
        assert!(matches!(&error, Error::Server { code: actual, .. } if actual == code));
        assert_eq!(serde_json::to_value(error).unwrap(), message);
    }
}

#[test]
fn the_stage_from_the_docs_parses_with_its_room_map() {
    // Beispiel aus `apps/server/docs/api.md`.
    let body = r#"{
      "last_event_id": 42, "server_time": 1795000000000,
      "room": { "width": 100, "height": 100, "unit": "percent" },
      "areas": [{
        "id": 1, "x": 0, "y": 0, "width": 50, "height": 100, "rotation": 12.5, "kind": "seats",
        "blocks": false, "prop": "", "name": null
      }],
      "players": [{
        "id": 1, "name": "Glibber", "color": "mint", "equipped": {}, "level": 1,
        "sign": null, "follow": { "player_id": 2, "ends_at": 1795001800000 }, "area_id": 1,
        "is_visitor": false, "home_x": 24.2, "home_y": 61.8
      }],
      "moves": [{
        "player_id": 1, "kind": "wander", "start_at": 1795000001000, "stack_level": 0,
        "points": [{ "x": 24.2, "y": 61.8, "t": 0 }, { "x": 27.4, "y": 58, "t": 2400 }]
      }],
      "stacks": [{ "id": 4, "x": 10, "y": 20, "ends_at": 1795000120000, "member_ids": [1, 2] }],
      "gathering": { "kind": "ceremony", "winner_id": 1, "ends_at": 1795000500000 }
    }"#;
    let stage: Stage = serde_json::from_str(body).unwrap();
    assert_eq!(stage.players[0].name, "Glibber");
    assert_eq!(
        stage.players[0]
            .follow
            .as_ref()
            .map(|follow| follow.player_id),
        Some(2)
    );
    assert_eq!(stage.areas[0].rotation, 12.5);
    assert_eq!(
        stage
            .gathering
            .as_ref()
            .map(|gathering| gathering.winner_id),
        Some(Some(1))
    );
    assert_eq!(stage.players[0].area_id, Some(1));
    assert_eq!(stage.players[0].home_x, 24.2);
    assert_eq!(stage.last_event_id, 42);
    assert_eq!(stage.areas[0].kind, "seats");
    assert_eq!(stage.areas[0].width, 50.0);
    assert_eq!(stage.room.unit, "percent");
    assert_eq!(stage.moves[0].points[1].t, 2400);
    assert_eq!(stage.stacks[0].member_ids, [1, 2]);
}

#[test]
fn a_refused_follow_keeps_the_server_message() {
    let message = "Zu diesem Jelly kannst du dich nicht stellen.";
    let body = json!({ "error": { "code": "invalid_follow", "message": message } }).to_string();
    let error = parse_error(StatusCode::BAD_REQUEST, &body);
    assert!(matches!(&error, Error::Server { code, .. } if code == "invalid_follow"));
    assert_eq!(serde_json::to_value(error).unwrap(), message);
}

#[test]
fn a_highlight_too_soon_keeps_the_server_message() {
    let message = "Warte kurz bis zum nächsten Hervorheben.";
    let body = json!({ "error": { "code": "highlight_cooldown", "message": message } }).to_string();
    let error = parse_error(StatusCode::CONFLICT, &body);
    assert!(matches!(&error, Error::Server { code, .. } if code == "highlight_cooldown"));
    assert_eq!(serde_json::to_value(error).unwrap(), message);
}
