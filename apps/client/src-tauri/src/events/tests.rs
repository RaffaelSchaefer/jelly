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
}

#[test]
fn a_removed_player_is_read_from_the_payload() {
    let removed = |id| event(PLAYER_REMOVED, None, json!({ "player_id": id }));
    assert!(is_own_event(&removed(7), 7));
    assert!(!is_own_event(&removed(8), 7));
}
