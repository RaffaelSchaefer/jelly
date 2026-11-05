//! Tests für Laden und Speichern, jeweils mit eigenem Temp-Verzeichnis.

use super::*;
use crate::pet::{DEFAULT_SIZE, MAX_SIZE, MAX_VOLUME};

#[test]
fn secret_and_settings_survive_reopening() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("nested").join("jelly.json");
    let mut store = Store::open(path.clone()).unwrap();
    assert_eq!(store.local.secret, None);
    store.set_secret("geheim".into()).unwrap();
    store
        .set_settings(Settings {
            reduced_motion: true,
            size: 130,
            sound: false,
            volume: 40,
            optimized_rendering: true,
        })
        .unwrap();
    let restored = Store::open(path).unwrap();
    assert_eq!(restored.local.secret.as_deref(), Some("geheim"));
    assert!(restored.local.settings.reduced_motion);
    assert_eq!(restored.local.settings.size, 130);
    assert!(!restored.local.settings.sound);
    assert_eq!(restored.local.settings.volume, 40);
    assert!(restored.local.settings.optimized_rendering);
}

#[test]
fn switching_optimized_rendering_off_survives_reopening_and_keeps_the_secret() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("jelly.json");
    let mut store = Store::open(path.clone()).unwrap();
    store.set_secret("geheim".into()).unwrap();
    let on = Settings {
        optimized_rendering: true,
        ..Settings::default()
    };
    store.set_settings(on).unwrap();
    store.set_settings(Settings::default()).unwrap();
    let restored = Store::open(path).unwrap();
    assert!(!restored.local.settings.optimized_rendering);
    assert_eq!(restored.local.secret.as_deref(), Some("geheim"));
}

#[test]
fn an_invalid_optimized_rendering_value_is_rejected_and_the_file_preserved() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("jelly.json");
    let wrong = r#"{"schemaVersion":2,"token":"geheim","settings":{"reducedMotion":false,"size":100,"optimizedRendering":"ja"}}"#;
    fs::write(&path, wrong).unwrap();
    assert!(matches!(Store::open(path.clone()), Err(Error::Corrupt(_))));
    assert_eq!(fs::read_to_string(&path).unwrap(), wrong);
}

#[test]
fn a_failed_save_keeps_the_confirmed_optimized_rendering() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("jelly.json");
    let mut store = Store::open(path.clone()).unwrap();
    store.set_secret("alt".into()).unwrap();
    fs::create_dir(path.with_extension("tmp")).unwrap();
    let on = Settings {
        optimized_rendering: true,
        ..Settings::default()
    };
    assert!(matches!(store.set_settings(on), Err(Error::Save(_))));
    assert!(!store.local.settings.optimized_rendering);
    assert!(!Store::open(path).unwrap().local.settings.optimized_rendering);
}

#[test]
fn a_save_file_without_sound_loads_with_sound_on_at_full_volume() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("jelly.json");
    let older =
        r#"{"schemaVersion":2,"token":"geheim","settings":{"reducedMotion":true,"size":110}}"#;
    fs::write(&path, older).unwrap();
    let restored = Store::open(path).unwrap();
    assert_eq!(restored.local.secret.as_deref(), Some("geheim"));
    assert!(restored.local.settings.reduced_motion);
    assert!(restored.local.settings.sound);
    assert_eq!(restored.local.settings.volume, MAX_VOLUME);
    assert!(!restored.local.settings.optimized_rendering);
}

#[test]
fn corrupt_and_other_save_files_are_preserved() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("jelly.json");

    fs::write(&path, "broken json").unwrap();
    assert!(matches!(Store::open(path.clone()), Err(Error::Corrupt(_))));
    assert_eq!(fs::read_to_string(&path).unwrap(), "broken json");

    let older = r#"{"schemaVersion":1,"settings":{"reducedMotion":false,"size":100}}"#;
    fs::write(&path, older).unwrap();
    assert!(matches!(
        Store::open(path.clone()),
        Err(Error::UnknownSchema)
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), older);
}

#[test]
fn invalid_sizes_are_rejected_without_saving() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("jelly.json");
    let mut store = Store::open(path.clone()).unwrap();
    let wrong = Settings {
        size: MAX_SIZE + 10,
        ..Settings::default()
    };
    assert!(matches!(store.set_settings(wrong), Err(Error::InvalidSize)));
    assert_eq!(store.local.settings.size, DEFAULT_SIZE);
    assert!(!path.exists());
}

#[test]
fn failed_save_keeps_last_successful_state() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("jelly.json");
    let mut store = Store::open(path.clone()).unwrap();
    store.set_secret("alt".into()).unwrap();
    fs::create_dir(path.with_extension("tmp")).unwrap();
    assert!(matches!(
        store.set_secret("neu".into()),
        Err(Error::Save(_))
    ));
    assert_eq!(store.local.secret.as_deref(), Some("alt"));
    assert_eq!(
        Store::open(path).unwrap().local.secret.as_deref(),
        Some("alt")
    );
}
