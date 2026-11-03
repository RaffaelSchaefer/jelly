//! Tests für Laden und Speichern, jeweils mit eigenem Temp-Verzeichnis.

use super::*;
use crate::pet::{DEFAULT_SIZE, MAX_SIZE};

#[test]
fn token_and_settings_survive_reopening() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("nested").join("jelly.json");
    let mut store = Store::open(path.clone()).unwrap();
    assert_eq!(store.local.token, None);
    store.set_token("geheim".into()).unwrap();
    store
        .set_settings(Settings {
            reduced_motion: true,
            size: 130,
        })
        .unwrap();
    let restored = Store::open(path).unwrap();
    assert_eq!(restored.local.token.as_deref(), Some("geheim"));
    assert!(restored.local.settings.reduced_motion);
    assert_eq!(restored.local.settings.size, 130);
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
        reduced_motion: false,
        size: MAX_SIZE + 10,
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
    store.set_token("alt".into()).unwrap();
    fs::create_dir(path.with_extension("tmp")).unwrap();
    assert!(matches!(store.set_token("neu".into()), Err(Error::Save(_))));
    assert_eq!(store.local.token.as_deref(), Some("alt"));
    assert_eq!(
        Store::open(path).unwrap().local.token.as_deref(),
        Some("alt")
    );
}
