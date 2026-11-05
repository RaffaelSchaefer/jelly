//! Alle Fehler, die das Backend an die Oberfläche meldet.
//!
//! Jede Variante trägt ihre deutsche Meldung selbst (`#[error("…")]`). Tauri verlangt, dass
//! alles, was ein Befehl zurückgibt, serialisierbar ist. [`Error`] serialisiert sich deshalb als
//! genau diese Meldung: Die Oberfläche bekommt einen fertigen Text und zeigt ihn unverändert an.

use serde::{Serialize, Serializer};

use crate::pet::{MAX_SIZE, MAX_VOLUME, MIN_SIZE, MIN_VOLUME};

/// Kurzform für Ergebnisse, die mit [`Error`] scheitern können.
pub type Result<T> = std::result::Result<T, Error>;

/// Alles, was beim Laden, Speichern oder im Gespräch mit dem Server schiefgehen kann.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// Die Datei hat eine unbekannte `schemaVersion`, stammt also aus einer anderen App-Version.
    #[error("Diese Datei stammt aus einer anderen App-Version. Sie bleibt unverändert.")]
    UnknownSchema,

    /// Die Größe liegt außerhalb von [`MIN_SIZE`]…[`MAX_SIZE`].
    #[error("Die Größe muss zwischen {MIN_SIZE} und {MAX_SIZE} % liegen.")]
    InvalidSize,

    /// Die Lautstärke liegt außerhalb von [`MIN_VOLUME`]…[`MAX_VOLUME`].
    #[error("Die Lautstärke muss zwischen {MIN_VOLUME} und {MAX_VOLUME} % liegen.")]
    InvalidVolume,

    /// Die Datei existiert, ist aber kein gültiger Stand. Sie wird nicht überschrieben.
    #[error("Gespeicherte Daten konnten nicht gelesen werden: {0}. Die Datei bleibt unverändert.")]
    Corrupt(#[source] serde_json::Error),

    /// Die Datei existiert, lässt sich aber nicht lesen (zum Beispiel wegen fehlender Rechte).
    #[error("Gespeicherte Daten konnten nicht geöffnet werden: {0}")]
    Open(#[source] std::io::Error),

    /// Schreiben ist fehlgeschlagen. Der vorherige Stand bleibt auf der Platte und im Speicher.
    #[error("Speichern fehlgeschlagen: {0}. Die Änderung wurde nicht übernommen.")]
    Save(#[source] std::io::Error),

    /// Tauri kennt kein App-Datenverzeichnis für diese Plattform.
    #[error("App-Datenverzeichnis nicht verfügbar: {0}")]
    DataDir(#[source] tauri::Error),

    /// Der Server hat abgelehnt. `message` kommt fertig auf Deutsch vom Server.
    #[error("{message}")]
    Server {
        /// Stabiler Code für Programme, zum Beispiel `report_cooldown`.
        code: String,
        /// Anzeigetext vom Server.
        message: String,
    },

    /// Der Server kennt das Secret nicht mehr (`401`). Das Secret bleibt trotzdem gespeichert.
    #[error("Dein Zugang gilt nicht mehr. Hol dir von der Orga einen neuen Code.")]
    Unauthorized,

    /// Der Server war nicht erreichbar oder hat keine lesbare Antwort geschickt.
    #[error("Server nicht erreichbar: {0}")]
    Network(#[source] reqwest::Error),

    /// Der Server verlangt eine neuere App.
    #[error("Bitte aktualisiere Jelly. Der Server braucht mindestens Version {min}.")]
    Outdated {
        /// Mindestversion laut Server.
        min: String,
    },

    /// Eine Aktion braucht ein Konto, es gibt aber noch kein Secret.
    #[error("Du bist noch nicht registriert.")]
    NotRegistered,

    /// Das Fenster der Karte ließ sich nicht öffnen.
    #[error("Die Karte konnte nicht geöffnet werden: {0}")]
    Window(#[source] tauri::Error),
}

/// Serialisiert den Fehler als seine Meldung, denn mehr braucht die Oberfläche nicht.
impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
