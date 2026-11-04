//! Tests für die reinen Spielregeln, ohne Dateizugriff.

use super::*;

/// Ein Aussehen mit Standardfarbe und -bewegung, nur Name und Größe variieren.
fn look(name: &str, size: u8) -> Appearance {
    Appearance {
        name: name.into(),
        color: Color::Lilac,
        reduced_motion: true,
        size,
    }
}

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
    pet.customize(look("  Byte  ", DEFAULT_SIZE)).unwrap();
    assert_eq!(pet.name, "Byte");
    assert_eq!(pet.color, Color::Lilac);
    assert!(pet.reduced_motion);
    for name in ["  ", &"x".repeat(MAX_NAME_LEN + 1), "bad\nname"] {
        assert!(matches!(
            pet.customize(look(name, DEFAULT_SIZE)),
            Err(Error::InvalidName)
        ));
    }
    assert_eq!(pet.name, "Byte");
    assert!(serde_json::from_str::<Color>("\"invalid\"").is_err());

    pet.customize(look("Byte", MAX_SIZE)).unwrap();
    assert_eq!(pet.size, MAX_SIZE);
    for size in [MIN_SIZE - 1, MAX_SIZE + 1] {
        assert!(matches!(
            pet.customize(look("Byte", size)),
            Err(Error::InvalidSize)
        ));
    }
    assert_eq!(pet.size, MAX_SIZE);
}
