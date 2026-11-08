//! Die Befehle zur Bühne: wer dort steht, was die Karte zeigt und was man auf ihr auslöst.

use serde::Serialize;
use tauri::{AppHandle, State};

use super::{session::session, Game, GameState};
use crate::{
    api::{Stage, Trip},
    error::{Error, Result},
    map,
};

/// Was die Karte bei jedem Lesen bekommt.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapState {
    /// Das eigene Jelly. Frisch je Lesen, denn ein neuer Code kann es ändern.
    own_id: i64,
    /// Einstellung „Weniger Bewegung“, `None` folgt dem Betriebssystem.
    reduced_motion: Option<bool>,
    /// Einstellung „Optimierter Modus“: feste Knöpfe statt Glas.
    optimized_rendering: bool,
    /// Einstellung „Bildrate“, `None` heißt unbegrenzt.
    frame_limit: Option<u16>,
    /// Regel `near_distance` der LAN: Bis dahin reicht eine Aufforderung, in Jelly-Einheiten.
    near_distance: f64,
    /// Der laufende Ausflug des eigenen Jellys. Die Bühne nennt ihn nicht, nur der eigene Stand.
    trip: Option<Trip>,
    /// Raumkarte und Jellies vom Server.
    stage: Stage,
}

/// Liest, wer gerade auf der Bühne steht.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler.
#[tauri::command]
pub async fn get_stage(app: AppHandle, state: State<'_, GameState>) -> Result<Stage> {
    let api = {
        let mut slot = state.0.lock().await;
        let session = session(&app, &mut slot).await?;
        session.registered()?;
        session.api.clone()
    };
    // Ohne Lock: Hinge diese Anfrage, warteten alle Aktionen des Pets mit.
    api.stage().await
}

/// Schickt das Jelly auf einen Ausflug zu einem Punkt der Bühne, in Prozent.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa `invalid_trip`.
#[tauri::command]
pub async fn go_to(app: AppHandle, state: State<'_, GameState>, x: f64, y: f64) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let me = session.api.go_to(x, y).await?;
    session.set_me(me);
    Ok(session.game())
}

/// Lässt ein Jelly aufleuchten. Den Lichtkegel zeichnet die Bühne, sobald das Ereignis ankommt.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa `highlight_cooldown`.
#[tauri::command]
pub async fn highlight_player(
    app: AppHandle,
    state: State<'_, GameState>,
    player_id: i64,
) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let me = session.api.highlight(player_id).await?;
    session.set_me(me);
    Ok(session.game())
}

/// Liest, was die Karte zeigt. Öffnet keine Sitzung, das Laden gehört dem Pet-Fenster.
///
/// # Fehler
///
/// [`Error::NotRegistered`] ohne geladene Sitzung oder Konto, sonst Netzwerk- oder Serverfehler.
#[tauri::command]
pub async fn get_map_state(app: AppHandle, state: State<'_, GameState>) -> Result<MapState> {
    let (api, own_id, trip, settings, near_distance) = {
        let mut slot = state.0.lock().await;
        let session = slot.as_mut().ok_or(Error::NotRegistered)?;
        // Über `refresh`, damit der neue Stream beim frischen Stand beginnt und das Pet nichts
        // zweimal hört, was es schon gehört hat.
        if !session.stream.is_running() {
            session.refresh(&app).await?;
        }
        let me = session.registered()?;
        (
            session.api.clone(),
            me.id,
            me.trip.clone(),
            session.store.local.settings,
            session.lan.rules.near_distance,
        )
    };
    let stage = api.stage().await?;
    Ok(MapState {
        own_id,
        reduced_motion: settings.reduced_motion,
        optimized_rendering: settings.optimized_rendering,
        frame_limit: settings.frame_limit,
        near_distance,
        trip,
        stage,
    })
}

/// Öffnet die Karte oder holt sie nach vorn.
///
/// Asynchron, denn ein Fenster aus einem synchronen Befehl blockiert unter Windows die App.
///
/// # Fehler
///
/// [`Error::Window`], wenn sich das Fenster nicht öffnen lässt.
#[tauri::command]
pub async fn open_map(app: AppHandle) -> Result<()> {
    map::open(&app)
}
