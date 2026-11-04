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
