//! Die Tauri-Befehle, die die Oberfläche über `invoke()` aufruft.
//!
//! Jeder Befehl holt sich die [`session::Session`], spricht bei Bedarf mit dem Server und gibt den neuen
//! [`Game`] zurück. Die Oberfläche schickt nur, *was* passieren soll (eine Aktion, ein Code, ein
//! Name), nie XP-Werte. Das Secret bleibt in Rust.
//!
//! Gegenstück im Frontend: `src/backend.ts`. Neue Befehle zusätzlich in [`crate::run`] bei
//! `generate_handler!` eintragen, sonst findet die Oberfläche sie nicht.

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::{
    api::{AccessBody, Api, EquipBody, Profile},
    error::Result,
    pet::{poke_due, Action, Color, Settings},
};

pub mod partner;
mod session;
pub mod stage;

use session::session;
pub use session::{Game, GameState};

/// Ergebnis von [`act`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActResult {
    /// Gewonnene XP, 0 bei einem zu frühen Stupser.
    xp_gained: i64,
    /// Neuer Stand.
    game: Game,
}

/// Ergebnis von [`redeem_code`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedeemResult {
    /// Titel des Events.
    title: String,
    /// Gewonnene XP.
    xp_gained: i64,
    /// Neuer Stand.
    game: Game,
}

/// Lädt Stand und LAN neu. Auch für „Erneut versuchen“ und nach einem Fehler.
#[tauri::command]
pub async fn get_game(app: AppHandle, state: State<'_, GameState>) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.refresh(&app).await?;
    Ok(session.game())
}

/// Die festen Listen des Servers: Farben, Cosmetics, Erfolge und mehr.
#[tauri::command]
pub async fn get_catalog() -> Result<Value> {
    Api::new(None).catalog().await
}

/// Tauscht einen Code gegen ein Secret und merkt es sich. Legt ein Konto an oder holt das vorhandene
/// zurück, ein älteres Secret gilt danach nicht mehr.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa `code_redeemed`, dazu [`crate::error::Error::Save`].
#[tauri::command]
pub async fn redeem_access(
    app: AppHandle,
    state: State<'_, GameState>,
    code: String,
    name: Option<String>,
    color: Option<Color>,
) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    let name = name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty());
    let body = AccessBody {
        code: code.trim(),
        name,
        color,
    };
    let access = session.api.redeem_access(&body).await?;
    // Erst im Speicher übernehmen: Scheitert das Speichern, läuft wenigstens diese Sitzung weiter.
    session.api.set_secret(access.secret.clone());
    session.secret_rejected = false;
    session.set_me(access.me);
    session.stream.stop();
    session.store.set_secret(access.secret)?;
    session.lan = session.api.current_lan().await?;
    session.follow_events(&app);
    Ok(session.game())
}

/// Stupser oder Selbstmeldung. Ein Stupser geht erst raus, wenn `next_poke_at` erreicht ist.
#[tauri::command]
pub async fn act(app: AppHandle, state: State<'_, GameState>, action: Action) -> Result<ActResult> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    let me = session.registered()?;
    let now = session.server_now().unwrap_or(me.server_time);
    if action == Action::Poke && !poke_due(me.next_poke_at, now) {
        return Ok(ActResult {
            xp_gained: 0,
            game: session.game(),
        });
    }
    let answer = match action {
        Action::Poke => session.api.poke().await?,
        report => session.api.report(report).await?,
    };
    session.set_me(answer.me);
    Ok(ActResult {
        xp_gained: answer.xp_gained,
        game: session.game(),
    })
}

/// Spielt eine Geste aus dem Server-Katalog.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa wenn die Abklingzeit noch läuft.
#[tauri::command]
pub async fn emote(app: AppHandle, state: State<'_, GameState>, key: String) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let me = session.api.emote(&key).await?;
    session.set_me(me);
    Ok(session.game())
}

/// Hebt ein Schild aus dem Server-Katalog oder senkt es mit `None`.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa ohne laufende LAN.
#[tauri::command]
pub async fn set_sign(
    app: AppHandle,
    state: State<'_, GameState>,
    key: Option<String>,
) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let me = match key.as_deref() {
        Some(key) => session.api.show_sign(key).await?,
        None => session.api.lower_sign().await?,
    };
    session.set_me(me);
    Ok(session.game())
}

/// Lässt das Jelly einem anderen nachlaufen oder mit `None` zurück auf seinen Platz gehen.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa `invalid_follow`.
#[tauri::command]
pub async fn set_follow(
    app: AppHandle,
    state: State<'_, GameState>,
    player_id: Option<i64>,
) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let me = match player_id {
        Some(player_id) => session.api.follow(player_id).await?,
        None => session.api.end_trip().await?,
    };
    session.set_me(me);
    Ok(session.game())
}

/// Löst einen Event-Code ein.
#[tauri::command]
pub async fn redeem_code(
    app: AppHandle,
    state: State<'_, GameState>,
    code: String,
) -> Result<RedeemResult> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let answer = session.api.redeem_event_code(code.trim()).await?;
    session.set_me(answer.me);
    Ok(RedeemResult {
        title: answer.title,
        xp_gained: answer.xp_gained,
        game: session.game(),
    })
}

/// Übernimmt Name und/oder Farbe. Fehlende Felder bleiben, wie sie sind.
#[tauri::command]
pub async fn update_profile(
    app: AppHandle,
    state: State<'_, GameState>,
    name: Option<String>,
    color: Option<Color>,
) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let profile = Profile {
        name: name.map(|name| name.trim().to_owned()),
        color,
    };
    let me = session.api.update_profile(&profile).await?;
    session.set_me(me);
    Ok(session.game())
}

/// Legt ein Cosmetic auf einen Platz oder leert ihn mit `None`.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa wenn das Cosmetic nicht freigeschaltet ist.
#[tauri::command]
pub async fn equip_cosmetic(
    app: AppHandle,
    state: State<'_, GameState>,
    slot: String,
    key: Option<String>,
    color: Option<String>,
) -> Result<Game> {
    let mut game = state.0.lock().await;
    let session = session(&app, &mut game).await?;
    session.registered()?;
    let me = session.api.equip(&EquipBody { slot, key, color }).await?;
    session.set_me(me);
    Ok(session.game())
}

/// Übernimmt Größe und Bewegung. Bleibt auf dem Gerät.
#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    state: State<'_, GameState>,
    settings: Settings,
) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.store.set_settings(settings)?;
    Ok(session.game())
}

/// Meldet, dass die App noch läuft. Gibt keine XP und hält das Jelly auf der Bühne.
#[tauri::command]
pub async fn presence(app: AppHandle, state: State<'_, GameState>) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let me = session.api.presence().await?;
    session.set_me(me);
    Ok(session.game())
}
