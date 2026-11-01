use super::*;
use std::time::Duration;

#[test]
fn lan_actions_gain_xp_and_cross_level_boundaries() {
    let mut pet = Pet::default();
    pet.apply(Action::Food);
    pet.apply(Action::Drink);
    pet.apply(Action::Event);
    assert_eq!(pet.xp, 55);
    assert_eq!(pet.level(), 1);
    pet.xp = 99;
    pet.apply(Action::Activity);
    assert_eq!(pet.level(), 2);
    assert_eq!(pet.xp, 100);
}

#[test]
fn xp_saturates_instead_of_overflowing() {
    let mut pet = Pet {
        xp: u32::MAX,
        ..Pet::default()
    };
    pet.apply(Action::Event);
    assert_eq!(pet.xp, u32::MAX);
}

#[test]
fn settings_trim_names_and_reject_invalid_values() {
    let mut pet = Pet::default();
    pet.customize("  Byte  ".into(), Color::Lilac, true, DEFAULT_SIZE)
        .unwrap();
    assert_eq!(pet.name, "Byte");
    assert!(pet.reduced_motion);
    assert!(pet
        .customize("  ".into(), Color::Mint, false, DEFAULT_SIZE)
        .is_err());
    assert!(pet
        .customize("x".repeat(25), Color::Mint, false, DEFAULT_SIZE)
        .is_err());
    assert!(pet
        .customize("bad\nname".into(), Color::Mint, false, DEFAULT_SIZE)
        .is_err());
    assert_eq!(pet.name, "Byte");
    assert!(serde_json::from_str::<Color>("\"invalid\"").is_err());
    pet.customize("Byte".into(), Color::Lilac, true, MAX_SIZE)
        .unwrap();
    assert_eq!(pet.size, MAX_SIZE);
    assert!(pet
        .customize("Byte".into(), Color::Lilac, true, MIN_SIZE - 1)
        .is_err());
    assert!(pet
        .customize("Byte".into(), Color::Lilac, true, MAX_SIZE + 1)
        .is_err());
    assert_eq!(pet.size, MAX_SIZE);
}

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
        .customize("Byte".into(), Color::Peach, true, 130)
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
    for contents in [
        "broken json".to_owned(),
        serde_json::to_string(&Pet {
            schema_version: 2,
            ..Pet::default()
        })
        .unwrap(),
    ] {
        fs::write(&path, &contents).unwrap();
        assert!(Store::open(path.clone()).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), contents);
    }
}

#[test]
fn failed_save_keeps_last_successful_state() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("pet.json");
    let mut store = Store::open(path.clone()).unwrap();
    store.interact_at(Action::Food, Instant::now(), 0).unwrap();
    fs::create_dir(path.with_extension("tmp")).unwrap();
    assert!(store.interact_at(Action::Drink, Instant::now(), 0).is_err());
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
    assert_eq!(blocked, "Das geht wieder in 29 min.");
    // Another kind is fine, and the same kind again once its cooldown is over.
    store.interact_at(Action::Food, now, 1_060).unwrap();
    store
        .interact_at(Action::Drink, now, 1_000 + REPORT_COOLDOWN)
        .unwrap();
    assert_eq!(store.pet.xp, 35);
    // Pokes never count as reports.
    store.interact_at(Action::Activity, now, 4_000).unwrap();
    assert_eq!(store.pet.log.len(), 3);

    let mut at = 10_000;
    for _ in 3..REPORTS_PER_WINDOW {
        store.interact_at(Action::Food, now, at).unwrap();
        at += REPORT_COOLDOWN;
    }
    assert_eq!(
        store.interact_at(Action::Drink, now, at).unwrap_err(),
        "Für heute ist genug gemeldet. Morgen geht’s weiter."
    );
    // Events are not self-reports: no limit for them, and they don't use up the reports.
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
    // A second event right away is fine; the same id again (a retry) gives no XP.
    store.record_event("cs2-turnier".into(), 1_001).unwrap();
    store.record_event(" mario-kart ".into(), 1_002).unwrap();
    assert_eq!(store.pet.xp, 60);
    assert_eq!(store.pet.log.len(), 2);
    assert!(store.record_event("  ".into(), 1_003).is_err());
    assert!(store.record_event("x".repeat(65), 1_003).is_err());
    // Events only come in with their id.
    assert!(store
        .interact_at(Action::Event, Instant::now(), 1_004)
        .is_err());
    assert_eq!(store.pet.xp, 60);
}

#[test]
fn cosmetics_are_validated() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path().join("pet.json")).unwrap();
    assert!(store.equip(Some("Bad Id".into())).is_err());
    assert!(store.equip(Some(String::new())).is_err());
    let equipped = store.equip(Some("pixel-glasses".into())).unwrap();
    assert_eq!(equipped.cosmetic.as_deref(), Some("pixel-glasses"));
    assert_eq!(store.equip(None).unwrap().cosmetic, None);
}
