//! Tests für Laden, Speichern und die Abläufe im Store, jeweils mit eigenem Temp-Verzeichnis.

use super::*;
use crate::pet::{Color, Entry, DEFAULT_SIZE, REPORTS_PER_WINDOW, REPORT_COOLDOWN, REPORT_WINDOW};

#[test]
fn activity_is_limited_to_once_a_second() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path().join("pet.json")).unwrap();
    let now = Instant::now();
    store.interact_at(Action::Activity, now, 0).unwrap();
    store
        .interact_at(Action::Activity, now + Duration::from_millis(900), 0)
        .unwrap();
    assert_eq!(store.pet.xp, 1);
    store.interact_at(Action::Food, now, 0).unwrap();
    assert_eq!(store.pet.xp, 16);
    store
        .interact_at(Action::Activity, now + Duration::from_secs(1), 0)
        .unwrap();
    assert_eq!(store.pet.xp, 17);
}

#[test]
fn stored_progress_and_customization_survive_reopening() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("nested").join("pet.json");
    let mut store = Store::open(path.clone()).unwrap();
    store.record_event("turnier-1".into(), 0).unwrap();
    store.equip(Some("party-hat".into())).unwrap();
    store
        .customize(Appearance {
            name: "Byte".into(),
            color: Color::Peach,
            reduced_motion: true,
            size: 130,
        })
        .unwrap();
    let restored = Store::open(path).unwrap();
    assert_eq!(restored.pet.xp, 30);
    assert_eq!(restored.pet.name, "Byte");
    assert_eq!(restored.pet.color, Color::Peach);
    assert!(restored.pet.reduced_motion);
    assert_eq!(restored.pet.size, 130);
    assert_eq!(restored.pet.cosmetic.as_deref(), Some("party-hat"));
    assert_eq!(
        restored.pet.log,
        vec![Entry {
            action: Action::Event,
            xp: 30,
            at: 0,
            event: Some("turnier-1".into())
        }]
    );
}

#[test]
fn save_files_from_before_resizing_load_at_default_size() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("pet.json");
    fs::write(
        &path,
        r#"{"schemaVersion":1,"name":"Byte","xp":5,"color":"mint","reducedMotion":false}"#,
    )
    .unwrap();
    assert_eq!(Store::open(path).unwrap().pet.size, DEFAULT_SIZE);
}

#[test]
fn corrupt_and_future_save_files_are_preserved() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("pet.json");
    let future = serde_json::to_string(&Pet {
        schema_version: 2,
        ..Pet::default()
    })
    .unwrap();

    fs::write(&path, "broken json").unwrap();
    assert!(matches!(Store::open(path.clone()), Err(Error::Corrupt(_))));
    assert_eq!(fs::read_to_string(&path).unwrap(), "broken json");

    fs::write(&path, &future).unwrap();
    assert!(matches!(
        Store::open(path.clone()),
        Err(Error::UnknownSchema)
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), future);
}

#[test]
fn failed_save_keeps_last_successful_state() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("pet.json");
    let mut store = Store::open(path.clone()).unwrap();
    store.interact_at(Action::Food, Instant::now(), 0).unwrap();
    fs::create_dir(path.with_extension("tmp")).unwrap();
    assert!(matches!(
        store.interact_at(Action::Drink, Instant::now(), 0),
        Err(Error::Save(_))
    ));
    assert_eq!(store.pet.xp, 15);
    assert_eq!(Store::open(path).unwrap().pet.xp, 15);
}

#[test]
fn self_reports_have_a_cooldown_and_a_daily_limit() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path().join("pet.json")).unwrap();
    let now = Instant::now();
    store.interact_at(Action::Drink, now, 1_000).unwrap();
    let blocked = store.interact_at(Action::Drink, now, 1_060).unwrap_err();
    assert!(matches!(blocked, Error::Cooldown { minutes: 29 }));
    // Die Oberfläche bekommt genau diesen Text.
    assert_eq!(
        serde_json::to_value(&blocked).unwrap(),
        "Das geht wieder in 29 min."
    );
    // Eine andere Art geht sofort, dieselbe wieder nach Ablauf ihrer Abklingzeit.
    store.interact_at(Action::Food, now, 1_060).unwrap();
    store
        .interact_at(Action::Drink, now, 1_000 + REPORT_COOLDOWN)
        .unwrap();
    assert_eq!(store.pet.xp, 35);
    // Stupser zählen nie als Meldung.
    store.interact_at(Action::Activity, now, 4_000).unwrap();
    assert_eq!(store.pet.log.len(), 3);

    let mut at = 10_000;
    for _ in 3..REPORTS_PER_WINDOW {
        store.interact_at(Action::Food, now, at).unwrap();
        at += REPORT_COOLDOWN;
    }
    assert!(matches!(
        store.interact_at(Action::Drink, now, at),
        Err(Error::DailyLimit)
    ));
    // Events sind keine Selbstmeldungen: kein Limit für sie, und sie verbrauchen keine Meldungen.
    store.record_event("lan-quiz".into(), at).unwrap();
    assert!(store
        .interact_at(Action::Drink, now, at + REPORT_WINDOW)
        .is_ok());
}

#[test]
fn events_count_once_per_id_and_skip_cooldown_and_limit() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path().join("pet.json")).unwrap();
    store.record_event("mario-kart".into(), 1_000).unwrap();
    // Ein zweites Event direkt danach geht, dieselbe ID noch einmal (Wiederholung) gibt keine XP.
    store.record_event("cs2-turnier".into(), 1_001).unwrap();
    store.record_event(" mario-kart ".into(), 1_002).unwrap();
    assert_eq!(store.pet.xp, 60);
    assert_eq!(store.pet.log.len(), 2);
    for id in ["  ".to_owned(), "x".repeat(MAX_EVENT_ID_LEN + 1)] {
        assert!(matches!(
            store.record_event(id, 1_003),
            Err(Error::InvalidEventId)
        ));
    }
    // Events kommen nur mit ihrer ID herein.
    assert!(matches!(
        store.interact_at(Action::Event, Instant::now(), 1_004),
        Err(Error::EventNeedsId)
    ));
    assert_eq!(store.pet.xp, 60);
}

#[test]
fn cosmetics_are_validated() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path().join("pet.json")).unwrap();
    for id in ["Bad Id", ""] {
        assert!(matches!(
            store.equip(Some(id.into())),
            Err(Error::UnknownCosmetic)
        ));
    }
    let equipped = store.equip(Some("pixel-glasses".into())).unwrap();
    assert_eq!(equipped.cosmetic.as_deref(), Some("pixel-glasses"));
    assert_eq!(store.equip(None).unwrap().cosmetic, None);
}
