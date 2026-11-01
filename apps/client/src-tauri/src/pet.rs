//! Das Spielmodell: wie ein Pet aussieht, wofür es XP gibt und welche Werte gültig sind.
//!
//! Hier gibt es weder Dateizugriff noch eine Uhr. Zeitpunkte kommen als Parameter herein, damit
//! sich jede Regel direkt testen lässt. Laden und Speichern übernimmt [`crate::store`].
//!
//! Die Oberfläche spiegelt Typen und Grenzwerte in `src/pet/types.ts`. Wer hier etwas ändert,
//! muss dort mitziehen.

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

/// Version des Dateiformats. Ein Spielstand mit anderer Version wird nicht geladen.
pub const SCHEMA_VERSION: u8 = 1;

/// Abklingzeit in Sekunden, bevor dieselbe Selbstmeldung (Essen, Getränk) wieder zählt.
pub const REPORT_COOLDOWN: u64 = 30 * 60;
/// Länge des rollenden Fensters in Sekunden, in dem [`REPORTS_PER_WINDOW`] gilt.
pub const REPORT_WINDOW: u64 = 24 * 60 * 60;
/// Höchstzahl an Selbstmeldungen pro [`REPORT_WINDOW`]. Events zählen nicht mit.
pub const REPORTS_PER_WINDOW: usize = 8;

/// Kleinste erlaubte Pet-Größe in Prozent.
pub const MIN_SIZE: u8 = 70;
/// Größte erlaubte Pet-Größe in Prozent.
pub const MAX_SIZE: u8 = 150;
/// Standardgröße in Prozent, auch für alte Spielstände ohne Größenangabe.
pub const DEFAULT_SIZE: u8 = 100;

/// Höchstlänge des Pet-Namens in Zeichen.
pub const MAX_NAME_LEN: usize = 24;
/// Höchstlänge einer Event-ID in Zeichen.
pub const MAX_EVENT_ID_LEN: usize = 64;
/// Höchstlänge einer Cosmetic-ID in Bytes (nur ASCII erlaubt).
pub const MAX_COSMETIC_ID_LEN: usize = 32;

/// Die Farbvarianten des Pets. In JSON klein geschrieben (`"mint"`).
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

/// Alles, wofür es XP gibt. In JSON klein geschrieben (`"food"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    /// Anstupsen per Klick oder Taste. Höchstens einmal pro Sekunde, wird nicht geloggt.
    Activity,
    /// Selbst gemeldetes Essen, mit Abklingzeit und Tageslimit.
    Food,
    /// Selbst gemeldetes Getränk, mit Abklingzeit und Tageslimit.
    Drink,
    /// Teilnahme an einem Event. Kommt nur mit Event-ID herein, siehe
    /// [`Store::record_event`](crate::store::Store::record_event).
    Event,
}

impl Action {
    /// Wie viele XP diese Aktion einbringt.
    pub const fn xp(self) -> u32 {
        match self {
            Action::Activity => 1,
            Action::Food => 15,
            Action::Drink => 10,
            Action::Event => 30,
        }
    }
}

/// Ein Eintrag im XP-Verlauf. Stupser werden nicht geloggt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    /// Wofür es die XP gab.
    pub action: Action,
    /// Wie viele XP es gab, festgehalten zum Zeitpunkt der Aktion.
    pub xp: u32,
    /// Unix-Zeit in Sekunden.
    pub at: u64,
    /// Nur bei Events: die ID aus dem System der Orga, damit eine Wiederholung nur einmal zählt.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
}

/// Was der Nutzer am Pet selbst einstellen kann. Kommt so aus der Oberfläche (`customize_pet`).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Appearance {
    /// Anzeigename. Wird beim Übernehmen getrimmt.
    pub name: String,
    /// Farbvariante.
    pub color: Color,
    /// Animation auf eine ruhige Darstellung reduzieren.
    pub reduced_motion: bool,
    /// Größe in Prozent, [`MIN_SIZE`]…[`MAX_SIZE`].
    pub size: u8,
}

/// Der komplette Spielstand, genau so, wie er in `pet.json` steht.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Pet {
    /// Version des Dateiformats, siehe [`SCHEMA_VERSION`].
    pub schema_version: u8,
    /// Anzeigename, 1–[`MAX_NAME_LEN`] Zeichen.
    pub name: String,
    /// Gesammelte XP. Gesättigt statt übergelaufen.
    pub xp: u32,
    /// Farbvariante.
    pub color: Color,
    /// Animation auf eine ruhige Darstellung reduzieren.
    pub reduced_motion: bool,
    /// Größe in Prozent. Alte Spielstände ohne dieses Feld laden mit [`DEFAULT_SIZE`].
    #[serde(default = "default_size")]
    pub size: u8,
    /// Jeder XP-Gewinn außer Stupsern, ältester zuerst. Grundlage für „heute“, Abklingzeiten
    /// und Erfolge.
    // ponytail: wächst unbegrenzt; ein LAN-Wochenende sind ein paar hundert Einträge. Kürzen, falls es je stört.
    #[serde(default)]
    pub log: Vec<Entry>,
    /// ID des angelegten Cosmetics. Was freigeschaltet ist, entscheidet die Oberfläche.
    #[serde(default)]
    pub cosmetic: Option<String>,
}

/// Standardwert für [`Pet::size`] beim Laden alter Spielstände.
fn default_size() -> u8 {
    DEFAULT_SIZE
}

impl Default for Pet {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            name: "Pixel".into(),
            xp: 0,
            color: Color::Mint,
            reduced_motion: false,
            size: DEFAULT_SIZE,
            log: Vec::new(),
            cosmetic: None,
        }
    }
}

/// Prüft, ob `text` nach dem Trimmen nicht leer ist, höchstens `max` Zeichen hat und keine
/// Steuerzeichen enthält. Gilt für Namen und Event-IDs.
pub(crate) fn is_label(text: &str, max: usize) -> bool {
    !text.trim().is_empty() && text.chars().count() <= max && !text.chars().any(char::is_control)
}

/// Prüft eine Cosmetic-ID: 1–[`MAX_COSMETIC_ID_LEN`] Zeichen aus `a–z`, `0–9` und `-`.
fn is_cosmetic_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_COSMETIC_ID_LEN
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

impl Pet {
    /// Aktuelles Level: alle 100 XP eins mehr, beginnend bei 1.
    pub fn level(&self) -> u32 {
        self.xp / 100 + 1
    }

    /// Prüft den ganzen Spielstand. Wird beim Laden und vor jedem Speichern aufgerufen.
    ///
    /// # Fehler
    ///
    /// [`Error::UnknownSchema`], [`Error::InvalidName`], [`Error::InvalidSize`] oder
    /// [`Error::UnknownCosmetic`], je nachdem, welches Feld nicht passt.
    pub(crate) fn validate(&self) -> Result<()> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(Error::UnknownSchema);
        }
        if !is_label(&self.name, MAX_NAME_LEN) {
            return Err(Error::InvalidName);
        }
        if !(MIN_SIZE..=MAX_SIZE).contains(&self.size) {
            return Err(Error::InvalidSize);
        }
        if self
            .cosmetic
            .as_deref()
            .is_some_and(|id| !is_cosmetic_id(id))
        {
            return Err(Error::UnknownCosmetic);
        }
        Ok(())
    }

    /// Schreibt die XP für `action` gut, ohne sie zu loggen, und gibt den Gewinn zurück.
    pub(crate) fn apply(&mut self, action: Action) -> u32 {
        let xp = action.xp();
        self.xp = self.xp.saturating_add(xp);
        xp
    }

    /// Schreibt die XP für `action` gut und hält sie im [`Pet::log`] fest.
    pub(crate) fn record(&mut self, action: Action, at: u64, event: Option<String>) {
        let xp = self.apply(action);
        self.log.push(Entry {
            action,
            xp,
            at,
            event,
        });
    }

    /// Prüft, ob die Selbstmeldung `action` zum Zeitpunkt `now` (Unix-Sekunden) gerade zählt.
    ///
    /// # Fehler
    ///
    /// [`Error::Cooldown`], solange dieselbe Meldung noch abklingt, sonst [`Error::DailyLimit`],
    /// wenn das rollende Tagesfenster voll ist.
    pub(crate) fn check_report(&self, action: Action, now: u64) -> Result<()> {
        let recent = |window: u64| {
            self.log
                .iter()
                .filter(move |entry| now.saturating_sub(entry.at) < window)
        };
        if let Some(last) = recent(REPORT_COOLDOWN).rfind(|entry| entry.action == action) {
            let minutes = (REPORT_COOLDOWN - now.saturating_sub(last.at)).div_ceil(60);
            return Err(Error::Cooldown { minutes });
        }
        let reports = recent(REPORT_WINDOW)
            .filter(|entry| entry.action != Action::Event)
            .count();
        if reports >= REPORTS_PER_WINDOW {
            return Err(Error::DailyLimit);
        }
        Ok(())
    }

    /// Übernimmt ein neues Aussehen. Der Name wird getrimmt. Ist etwas ungültig, bleibt das Pet
    /// unverändert.
    ///
    /// # Fehler
    ///
    /// Wie [`Pet::validate`].
    pub(crate) fn customize(&mut self, appearance: Appearance) -> Result<()> {
        let next = Self {
            name: appearance.name.trim().into(),
            color: appearance.color,
            reduced_motion: appearance.reduced_motion,
            size: appearance.size,
            ..self.clone()
        };
        next.validate()?;
        *self = next;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
