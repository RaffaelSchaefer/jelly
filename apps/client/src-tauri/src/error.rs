//! Alle Fehler, die das Backend an die Oberfläche meldet.
//!
//! Jede Variante trägt ihre deutsche Meldung selbst (`#[error("…")]`). Tauri verlangt, dass
//! alles, was ein Befehl zurückgibt, serialisierbar ist. [`Error`] serialisiert sich deshalb als
//! genau diese Meldung: Die Oberfläche bekommt einen fertigen Text und zeigt ihn unverändert an.

use serde::{Serialize, Serializer};

use crate::pet::{MAX_EVENT_ID_LEN, MAX_NAME_LEN, MAX_SIZE, MIN_SIZE};

/// Kurzform für Ergebnisse, die mit [`Error`] scheitern können.
pub type Result<T> = std::result::Result<T, Error>;

/// Alles, was beim Laden, Ändern oder Speichern des Spielstands schiefgehen kann.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// Die Datei hat eine unbekannte `schemaVersion`, stammt also aus einer anderen App-Version.
    #[error(
        "Dieser Spielstand stammt aus einer anderen App-Version. Die Datei bleibt unverändert."
    )]
    UnknownSchema,

    /// Der Name ist leer, zu lang oder enthält Steuerzeichen.
    #[error("Der Name muss 1–{MAX_NAME_LEN} Zeichen enthalten, ohne Steuerzeichen.")]
    InvalidName,

    /// Die Größe liegt außerhalb von [`MIN_SIZE`]…[`MAX_SIZE`].
    #[error("Die Größe muss zwischen {MIN_SIZE} und {MAX_SIZE} % liegen.")]
    InvalidSize,

    /// Die Cosmetic-ID ist leer, zu lang oder enthält andere Zeichen als `a–z`, `0–9` und `-`.
    /// Siehe [`MAX_COSMETIC_ID_LEN`](crate::pet::MAX_COSMETIC_ID_LEN).
    #[error("Unbekanntes Cosmetic.")]
    UnknownCosmetic,

    /// Die Event-ID ist leer, zu lang oder enthält Steuerzeichen.
    #[error("Die Event-ID muss 1–{MAX_EVENT_ID_LEN} Zeichen enthalten, ohne Steuerzeichen.")]
    InvalidEventId,

    /// Ein Event wurde als einfache Aktion gemeldet statt über `record_event` mit seiner ID.
    #[error("Events werden mit ihrer Event-ID gemeldet.")]
    EventNeedsId,

    /// Dieselbe Selbstmeldung (Essen, Getränk) kam vor Ablauf der Abklingzeit noch einmal.
    #[error("Das geht wieder in {minutes} min.")]
    Cooldown {
        /// Aufgerundete Minuten, bis die Meldung wieder zählt.
        minutes: u64,
    },

    /// Im laufenden 24-Stunden-Fenster wurde schon die Höchstzahl an Selbstmeldungen erreicht.
    #[error("Für heute ist genug gemeldet. Morgen geht’s weiter.")]
    DailyLimit,

    /// Die Datei existiert, ist aber kein gültiger Spielstand. Sie wird nicht überschrieben.
    #[error("Spielstand konnte nicht gelesen werden: {0}. Die Datei bleibt unverändert.")]
    Corrupt(#[source] serde_json::Error),

    /// Die Datei existiert, lässt sich aber nicht lesen (zum Beispiel wegen fehlender Rechte).
    #[error("Spielstand konnte nicht geöffnet werden: {0}")]
    Open(#[source] std::io::Error),

    /// Schreiben ist fehlgeschlagen. Der vorherige Stand bleibt auf der Platte und im Speicher.
    #[error("Speichern fehlgeschlagen: {0}. Die Änderung wurde nicht übernommen.")]
    Save(#[source] std::io::Error),

    /// Tauri kennt kein App-Datenverzeichnis für diese Plattform.
    #[error("App-Datenverzeichnis nicht verfügbar: {0}")]
    DataDir(#[source] tauri::Error),

    /// Ein früherer Befehl ist mitten im Zugriff abgestürzt und hat die Sperre vergiftet.
    #[error("Der Spielstand ist gerade nicht verfügbar. Bitte die App neu starten.")]
    Unavailable,

    /// Die Systemuhr liegt vor 1970, dann gibt es keinen Unix-Zeitstempel.
    #[error("Die Systemuhr steht vor 1970: {0}")]
    Clock(#[source] std::time::SystemTimeError),
}

/// Serialisiert den Fehler als seine Meldung, denn mehr braucht die Oberfläche nicht.
impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
