//! Die Tauri-Befehle, die die Oberfläche über `invoke()` aufruft.
//!
//! Jeder Befehl holt sich die [`session::Session`], spricht bei Bedarf mit dem Server und gibt den neuen
//! [`Game`] zurück. Die Oberfläche schickt nur, *was* passieren soll (eine Aktion, ein Code, ein
//! Name), nie XP-Werte. Das Token bleibt in Rust.
//!
//! Gegenstück im Frontend: `src/backend.ts`. Neue Befehle zusätzlich in [`crate::run`] bei
//! `generate_handler!` eintragen, sonst findet die Oberfläche sie nicht.

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::{
    api::{Api, Profile, Stage},
    error::{Error, Result},
    map,
    pet::{poke_due, Action, Color, Settings},
};

mod session;

use session::session;
pub use session::{Game, GameState};

/// Was die Karte bei jedem Lesen bekommt.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapState {
    /// Das eigene Jelly. Frisch je Lesen, denn eine neue Registrierung ändert es.
    own_id: i64,
    /// Einstellung „Weniger Bewegung“.
    reduced_motion: bool,
    /// Raumkarte und Jellies vom Server.
    stage: Stage,
}

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

/// Ergebnis von [`start_partner_emote`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerOfferResult {
    /// Vier Ziffern für den Partner.
    code: String,
    /// Gewähltes Partner-Emote.
    key: String,
    /// Ablauf des Codes als Server-Zeit.
    expires_at: i64,
    /// Neuer Stand.
    game: Game,
}

/// Ergebnis von [`join_partner_emote`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerJoinResult {
    /// Partner-Emote, das der Partner gewählt hat.
    key: String,
    /// Wer den Code erzeugt hat.
    partner_id: i64,
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

/// Legt ein Konto an und merkt sich das Token. Ersetzt ein abgelehntes altes Token.
#[tauri::command]
pub async fn register(
    app: AppHandle,
    state: State<'_, GameState>,
    code: String,
    name: String,
    color: Color,
) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    let registered = session
        .api
        .register(code.trim(), name.trim(), color)
        .await?;
    // Erst im Speicher übernehmen: Scheitert das Speichern, läuft wenigstens diese Sitzung weiter.
    session.api.set_token(registered.token.clone());
    session.token_rejected = false;
    session.set_me(registered.me);
    session.stream.stop();
    session.follow_events(&app);
    session.store.set_token(registered.token)?;
    session.lan = session.api.current_lan().await?;
    Ok(session.game())
}

/// Ein vorhandenes Konto tritt der laufenden LAN bei.
#[tauri::command]
pub async fn join_lan(app: AppHandle, state: State<'_, GameState>, code: String) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let me = session.api.join(code.trim()).await?;
    session.set_me(me);
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
    let answer = session.api.action(action).await?;
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

/// Stellt das Jelly neben ein anderes oder lässt es mit `None` weggehen.
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
        None => session.api.unfollow().await?,
    };
    session.set_me(me);
    Ok(session.game())
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

/// Liest, was die Karte zeigt. Öffnet keine Sitzung, das Laden gehört dem Pet-Fenster.
///
/// # Fehler
///
/// [`Error::NotRegistered`] ohne geladene Sitzung oder Konto, sonst Netzwerk- oder Serverfehler.
#[tauri::command]
pub async fn get_map_state(app: AppHandle, state: State<'_, GameState>) -> Result<MapState> {
    let (api, own_id, reduced_motion) = {
        let mut slot = state.0.lock().await;
        let session = slot.as_mut().ok_or(Error::NotRegistered)?;
        // Über `refresh`, damit der neue Stream beim frischen Stand beginnt und das Pet nichts
        // zweimal hört, was es schon gehört hat.
        if !session.stream.is_running() {
            session.refresh(&app).await?;
        }
        let own_id = session.registered()?.id;
        let reduced_motion = session.store.local.settings.reduced_motion;
        (session.api.clone(), own_id, reduced_motion)
    };
    let stage = api.stage().await?;
    Ok(MapState {
        own_id,
        reduced_motion,
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
    let answer = session.api.redeem(code.trim()).await?;
    session.set_me(answer.me);
    Ok(RedeemResult {
        title: answer.title,
        xp_gained: answer.xp_gained,
        game: session.game(),
    })
}

/// Startet ein Partner-Emote und liefert den Code, den man dem Partner nennt.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa wenn gerade zu viele Codes offen sind.
#[tauri::command]
pub async fn start_partner_emote(
    app: AppHandle,
    state: State<'_, GameState>,
    key: String,
) -> Result<PartnerOfferResult> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let offer = session.api.start_partner_emote(&key).await?;
    session.set_me(offer.me);
    Ok(PartnerOfferResult {
        code: offer.code,
        key: offer.key,
        expires_at: offer.expires_at,
        game: session.game(),
    })
}

/// Tritt mit dem Code eines anderen Jellys dessen Partner-Emote bei.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa bei einem abgelaufenen Code.
#[tauri::command]
pub async fn join_partner_emote(
    app: AppHandle,
    state: State<'_, GameState>,
    code: String,
) -> Result<PartnerJoinResult> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let result = session.api.join_partner_emote(code.trim()).await?;
    session.set_me(result.me);
    Ok(PartnerJoinResult {
        key: result.key,
        partner_id: result.partner_id,
        xp_gained: result.xp_gained,
        game: session.game(),
    })
}

/// Schickt ein geändertes Profil an den Server.
async fn patch_profile(app: &AppHandle, state: &GameState, profile: Profile) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(app, &mut slot).await?;
    session.registered()?;
    let me = session.api.update_profile(&profile).await?;
    session.set_me(me);
    Ok(session.game())
}

/// Übernimmt Name und/oder Farbe. Fehlende Felder bleiben, wie sie sind.
#[tauri::command]
pub async fn update_profile(
    app: AppHandle,
    state: State<'_, GameState>,
    name: Option<String>,
    color: Option<Color>,
) -> Result<Game> {
    let profile = Profile {
        name: name.map(|name| name.trim().to_owned()),
        color,
        cosmetic: None,
    };
    patch_profile(&app, &state, profile).await
}

/// Legt ein Cosmetic an oder mit `None` ab.
#[tauri::command]
pub async fn equip_cosmetic(
    app: AppHandle,
    state: State<'_, GameState>,
    cosmetic: Option<String>,
) -> Result<Game> {
    let profile = Profile {
        cosmetic: Some(cosmetic.unwrap_or_default()),
        ..Profile::default()
    };
    patch_profile(&app, &state, profile).await
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
