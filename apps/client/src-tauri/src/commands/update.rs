//! Updates der App: nachsehen, ob es eine neue Version gibt, und sie an Ort und Stelle einspielen.
//!
//! Die Liste der Versionen (`latest.json`) liegt am neuesten Release auf GitHub, nicht beim
//! Jelly-Server. Jedes Paket darin ist signiert, das Plugin prüft es gegen `plugins.updater.pubkey`
//! aus `tauri.conf.json`. Vorabversionen zählen nicht: `releases/latest` überspringt sie.

use serde::Serialize;
use tauri::{ipc::Channel, AppHandle};
use tauri_plugin_updater::UpdaterExt;

use crate::{error::Result, popout};

/// Fortschritt, der „fertig geladen, wird eingespielt“ heißt. Beim Laden bleibt er darunter.
const INSTALLING: u8 = 100;

/// Eine neuere Version samt der laufenden, für den Hinweis „0.2.0 → 0.3.0“.
#[derive(Debug, Clone, Serialize)]
pub struct AvailableUpdate {
    /// Version dieser App.
    current: String,
    /// Version am neuesten Release.
    version: String,
    /// `notes` aus `latest.json`: die `CHANGELOG.md` des Clients, die Oberfläche liest sie aus.
    notes: Option<String>,
}

/// Die neuere Version, falls es eine gibt.
///
/// # Fehler
///
/// [`crate::error::Error::Update`], wenn die Liste nicht erreichbar oder ungültig ist.
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<AvailableUpdate>> {
    let update = app.updater()?.check().await?;
    Ok(update.map(|update| AvailableUpdate {
        current: update.current_version,
        version: update.version,
        notes: update.body,
    }))
}

/// Lädt die neue Version, spielt sie ein und startet die App neu.
///
/// `progress` bekommt beim Laden ganze Prozent bis 99, jede Zahl nur einmal, und
/// [`INSTALLING`], sobald das Paket da ist. Kennt der Server die Größe nicht, kommt nur das.
///
/// Unter Windows beendet sich die App schon beim Einspielen selbst, der Installer startet sie danach.
/// Der Spielstand liegt dann längst auf der Platte, denn [`crate::store`] speichert jede Änderung sofort.
///
/// # Fehler
///
/// [`crate::error::Error::Update`], wenn Laden, Signatur oder Einspielen scheitern. Die alte Version
/// bleibt dann installiert.
#[tauri::command]
pub async fn install_update(app: AppHandle, progress: Channel<u8>) -> Result<()> {
    // ponytail: noch einmal nachsehen statt das `Update` aus `check_update` zu merken, kostet nur eine kleine Anfrage.
    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };
    // Karte und Shop vertreten das Pet. Nach dem Neustart käme sonst nur das Pet zurück.
    popout::close_all(&app);
    let mut loaded = 0;
    let mut shown = None;
    // Ein verlorener Fortschritt schadet nicht, das Fenster kann schon zu sein.
    update
        .download_and_install(
            |chunk, total| {
                loaded += chunk as u64;
                let Some(percent) = total.map(|total| percent(loaded, total)) else {
                    return;
                };
                if shown != Some(percent) {
                    shown = Some(percent);
                    progress.send(percent).ok();
                }
            },
            || {
                progress.send(INSTALLING).ok();
            },
        )
        .await?;
    app.restart()
}

/// Ganze Prozent von `loaded` an `total`, höchstens 99: 100 heißt schon [`INSTALLING`].
fn percent(loaded: u64, total: u64) -> u8 {
    let percent = loaded.saturating_mul(100) / total.max(1);
    u8::try_from(percent).unwrap_or(99).min(99)
}

#[cfg(test)]
mod tests {
    use super::percent;

    #[test]
    fn progress_stops_short_of_installing() {
        assert_eq!(percent(0, 200), 0);
        assert_eq!(percent(99, 200), 49);
        assert_eq!(percent(200, 200), 99);
        assert_eq!(percent(500, 200), 99);
        assert_eq!(percent(10, 0), 99);
    }
}
