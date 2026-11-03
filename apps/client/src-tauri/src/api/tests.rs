//! Tests für den Vertrag mit dem Server, ohne Netz.

use super::*;

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
    let body = r#"{
      "server_time": 1795000000000, "last_event_id": 42, "id": 1, "name": "Glibber",
      "color": "mint", "cosmetic": null, "hidden": false,
      "lan": { "slug": "ucb-2026", "name": "UCB LAN 2026", "active": true },
      "xp": 3, "level": 1, "total_xp": 3, "next_poke_at": 1795000900000,
      "reports": { "food_ready_at": 0, "drink_ready_at": 0, "reports_left": 8 },
      "sign": null, "follow_player_id": null, "lans_attended": 1,
      "badges": [{ "slug": "ucb-2026", "name": "UCB LAN 2026" }], "cosmetics": [],
      "achievements": [{ "key": "hatched", "title": "Frisch geschlüpft", "lan_slug": null,
        "earned_at": 1795000000000 }],
      "awards": [], "future_field": true
    }"#;
    let me: Me = serde_json::from_str(body).unwrap();
    assert_eq!(me.next_poke_at, Some(1_795_000_900_000));
    assert_eq!(me.reports.unwrap().reports_left, 8);
    assert_eq!(me.achievements[0].best, None);
}

#[test]
fn events_keep_their_type_name() {
    let body = r#"{"id":7,"type":"xp.gained","player_id":1,"payload":{"amount":3},"created_at":1}"#;
    let event: ServerEvent = serde_json::from_str(body).unwrap();
    assert_eq!(event.kind, "xp.gained");
    assert_eq!(serde_json::to_value(&event).unwrap()["type"], "xp.gained");
}
