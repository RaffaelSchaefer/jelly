//! Tests für die reinen Regeln, ohne Dateizugriff und ohne Netz.

use super::*;

#[test]
fn pokes_only_go_out_once_the_server_allows_them() {
    // Fälle aus `apps/server/testdata/contract/rules.json`, Intervall 900 s.
    let next = 1_000_000 + 900_000;
    assert!(!poke_due(Some(next), 1_000_000));
    assert!(!poke_due(Some(next), next - 1_000));
    assert!(poke_due(Some(next), next));
    assert!(poke_due(Some(next), next + 2_000_000));
    // Ohne laufende LAN nie.
    assert!(!poke_due(None, i64::MAX));
}

#[test]
fn client_versions_compare_numerically() {
    assert!(!client_outdated("0.1.0", ""));
    assert!(client_outdated("0.1.0", "0.2.0"));
    assert!(client_outdated("0.9.0", "0.10.0"));
    assert!(!client_outdated("1.0.0", "0.9.9"));
    assert!(!client_outdated("1.0.0", "1.0.0"));
    assert!(!client_outdated("1.0.0", "1.0"));
}

#[test]
fn local_state_rejects_other_versions_and_sizes() {
    let mut local = Local::new();
    assert!(local.validate().is_ok());
    local.settings.size = MAX_SIZE + 1;
    assert!(matches!(local.validate(), Err(Error::InvalidSize)));
    local.settings.size = DEFAULT_SIZE;
    local.settings.volume = MIN_VOLUME - 1;
    assert!(matches!(local.validate(), Err(Error::InvalidVolume)));
    local.settings.volume = MAX_VOLUME + 1;
    assert!(matches!(local.validate(), Err(Error::InvalidVolume)));
    local.settings.volume = MAX_VOLUME;
    local.schema_version = 1;
    assert!(matches!(local.validate(), Err(Error::UnknownSchema)));
}
