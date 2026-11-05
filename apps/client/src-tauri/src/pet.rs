//! Was das Gerät selbst weiß: Secret, Einstellungen und ein paar reine Regeln für den Server.
//!
//! XP, Level, Cosmetics und Erfolge bestimmt der Server (siehe [`crate::api`]). Hier bleiben nur
//! das Secret und die Geräte-Einstellungen Größe, Bewegung, Geräusche und Lautstärke, dazu reine Funktionen ohne
//! IO und ohne Uhr. Zeitpunkte kommen als Parameter herein, damit sich jede Regel direkt testen lässt.
//!
//! Die Oberfläche spiegelt Typen und Grenzwerte in `src/pet/types.ts`. Wer hier etwas ändert,
//! muss dort mitziehen.

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

/// Version des Dateiformats. Eine Datei mit anderer Version wird nicht geladen.
pub const SCHEMA_VERSION: u8 = 2;

/// Kleinste erlaubte Pet-Größe in Prozent.
pub const MIN_SIZE: u8 = 70;
/// Größte erlaubte Pet-Größe in Prozent.
pub const MAX_SIZE: u8 = 150;
/// Standardgröße in Prozent.
pub const DEFAULT_SIZE: u8 = 100;

/// Kleinste erlaubte Lautstärke in Prozent. Ganz still ist Sache des Schalters.
pub const MIN_VOLUME: u8 = 10;
/// Größte erlaubte Lautstärke in Prozent, zugleich der Standard.
pub const MAX_VOLUME: u8 = 100;

/// Version dieser App, verglichen mit `min_client_version` des Servers.
pub const CLIENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Die Farbvarianten des Pets. In JSON klein geschrieben (`"mint"`), wie beim Server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Color {
    /// Blau mit türkisem Leuchten, in der Oberfläche „Aqua“.
    Mint,
    /// Flieder.
    Lilac,
    /// Pfirsich.
    Peach,
}

/// Was die Oberfläche beim Server auslösen kann. In JSON klein geschrieben (`"poke"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    /// Anstupsen per Klick oder Taste. XP gibt es höchstens alle paar Minuten.
    Poke,
    /// Selbst gemeldetes Essen.
    Food,
    /// Selbst gemeldetes Getränk.
    Drink,
}

/// Wie sich eine Aufforderung zu einem Partner-Emote ändern kann. In JSON klein geschrieben.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InviteState {
    /// Das aufgeforderte Jelly macht mit.
    Accepted,
    /// Das aufgeforderte Jelly lehnt ab.
    Declined,
    /// Wer aufgefordert hat, zieht zurück.
    Cancelled,
}

/// Einstellungen, die nur dieses Gerät betreffen und nie zum Server gehen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    /// Animation auf eine ruhige Darstellung reduzieren.
    pub reduced_motion: bool,
    /// Größe in Prozent, [`MIN_SIZE`]…[`MAX_SIZE`].
    pub size: u8,
    /// Ob das Jelly Geräusche macht. Fehlt in älteren Dateien und gilt dort als an.
    #[serde(default = "default_sound")]
    pub sound: bool,
    /// Lautstärke in Prozent, [`MIN_VOLUME`]…[`MAX_VOLUME`]. Fehlt in älteren Dateien.
    #[serde(default = "default_volume")]
    pub volume: u8,
}

/// Geräusche sind an, bis jemand sie abschaltet.
fn default_sound() -> bool {
    true
}

/// Volle Lautstärke, bis jemand den Regler bewegt.
fn default_volume() -> u8 {
    MAX_VOLUME
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            reduced_motion: false,
            size: DEFAULT_SIZE,
            sound: default_sound(),
            volume: default_volume(),
        }
    }
}

/// Der lokale Stand, genau so, wie er in `jelly.json` steht.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Local {
    /// Version des Dateiformats, siehe [`SCHEMA_VERSION`].
    pub schema_version: u8,
    /// Secret vom Server. Gibt es nur einmal beim Einlösen eines Codes, darum nie still löschen.
    /// In der Datei heißt es weiter `token`, so gelten vorhandene Spielstände.
    #[serde(default, rename = "token")]
    pub secret: Option<String>,
    /// Geräte-Einstellungen.
    #[serde(default)]
    pub settings: Settings,
}

impl Local {
    /// Ein leerer Stand ohne Secret.
    pub fn new() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            ..Self::default()
        }
    }

    /// Prüft den ganzen Stand. Wird beim Laden und vor jedem Speichern aufgerufen.
    ///
    /// # Fehler
    ///
    /// [`Error::UnknownSchema`], [`Error::InvalidSize`] oder [`Error::InvalidVolume`].
    pub(crate) fn validate(&self) -> Result<()> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(Error::UnknownSchema);
        }
        if !(MIN_SIZE..=MAX_SIZE).contains(&self.settings.size) {
            return Err(Error::InvalidSize);
        }
        if !(MIN_VOLUME..=MAX_VOLUME).contains(&self.settings.volume) {
            return Err(Error::InvalidVolume);
        }
        Ok(())
    }
}

/// Ob sich ein Stupser beim Server lohnt. `next_poke_at` und `server_now` in Unix-Millisekunden.
///
/// Ohne laufende LAN (`None`) gibt es nichts zu holen. Ein zu früher Stupser wäre beim Server kein
/// Fehler, ergäbe aber nur `xp_gained: 0`, darum fragt die App gar nicht erst.
pub fn poke_due(next_poke_at: Option<i64>, server_now: i64) -> bool {
    next_poke_at.is_some_and(|next| server_now >= next)
}

/// Ob die App älter ist als `min`, beide in der Form `1.2.3`. Leer heißt keine Vorgabe.
///
/// Eine Angabe in anderer Form zählt nicht als Vorgabe, damit ein Tippfehler auf dem Server
/// niemanden aussperrt.
pub fn client_outdated(own: &str, min: &str) -> bool {
    let parse = |version: &str| -> Option<Vec<u32>> {
        let parts: Vec<u32> = version
            .split('.')
            .map(str::parse)
            .collect::<std::result::Result<_, _>>()
            .ok()?;
        (parts.len() == 3).then_some(parts)
    };
    match (parse(own), parse(min)) {
        (Some(own), Some(min)) => own < min,
        _ => false,
    }
}

#[cfg(test)]
mod tests;
