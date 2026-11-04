//! Die Tauri-Befehle, die die Oberfläche über `invoke()` aufruft.
//!
//! Jeder Befehl holt sich die [`Session`], spricht bei Bedarf mit dem Server und gibt den neuen
//! [`Game`] zurück. Die Oberfläche schickt nur, *was* passieren soll (eine Aktion, ein Code, ein
//! Name), nie XP-Werte. Das Token bleibt in Rust.
//!
//! Gegenstück im Frontend: `src/backend.ts`. Neue Befehle zusätzlich in [`crate::run`] bei
//! `generate_handler!` eintragen, sonst findet die Oberfläche sie nicht.

use std::time::Instant;

use serde::Serialize;
use serde_json::Value;
use tauri::{async_runtime::Mutex, AppHandle, Manager, State};

use crate::{
    api::{Api, LanStatus, Me, Profile, Stage, SERVER_URL},
    error::{Error, Result},
    events::EventStream,
    pet::{client_outdated, poke_due, Action, Color, Settings, CLIENT_VERSION},
    store::Store,
};

/// Die Sitzung als Tauri-State.
///
/// Wird erst beim ersten Befehl geöffnet, weil das App-Datenverzeichnis erst zur Laufzeit bekannt
/// ist. Der Mutex sorgt dafür, dass Befehle nacheinander laufen und sich nicht überholen.
#[derive(Default)]
pub struct GameState(Mutex<Option<Session>>);

/// Alles, was zwischen zwei Befehlen erhalten bleibt.
pub struct Session {
    /// Lokaler Stand mit Token und Einstellungen.
    store: Store,
    /// Client für den Server.
    api: Api,
    /// Letzter Stand vom Server und wann er ankam.
    me: Option<(Me, Instant)>,
    /// Welche LAN läuft.
    lan: LanStatus,
    /// Ob der Server das gespeicherte Token abgelehnt hat.
    token_rejected: bool,
    /// Weiterleitung der Server-Ereignisse an die Oberfläche.
    stream: EventStream,
}

/// Was die Oberfläche nach jedem Befehl bekommt.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    /// Geräte-Einstellungen.
    settings: Settings,
    /// Stand vom Server, `None` ohne Konto. `server_time` ist auf jetzt hochgerechnet.
    me: Option<Me>,
    /// Welche LAN läuft und welche kommt.
    lan: LanStatus,
    /// Adresse des Servers, zur Anzeige.
    server_url: &'static str,
    /// Ob der Server das gespeicherte Token abgelehnt hat. Dann hilft nur neu registrieren.
    token_rejected: bool,
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

impl Session {
    /// Öffnet `jelly.json`, prüft die App-Version beim Server und lädt den Stand.
    async fn open(app: &AppHandle) -> Result<Self> {
        let directory = app.path().app_data_dir().map_err(Error::DataDir)?;
        let store = Store::open(directory.join("jelly.json"))?;
        let api = Api::new(store.local.token.clone());
        let version = api.version().await?;
        if client_outdated(CLIENT_VERSION, &version.min_client_version) {
            return Err(Error::Outdated {
                min: version.min_client_version,
            });
        }
        let lan = api.anonymous().current_lan().await?;
        let mut session = Self {
            store,
            api,
            me: None,
            lan,
            token_rejected: false,
            stream: EventStream::default(),
        };
        session.refresh(app).await?;
        Ok(session)
    }

    /// Liest Stand und LAN neu. Ein abgelehntes Token wird gemerkt, aber nicht gelöscht.
    async fn refresh(&mut self, app: &AppHandle) -> Result<()> {
        if !self.api.has_token() {
            self.lan = self.api.current_lan().await?;
            return Ok(());
        }
        match self.api.me().await {
            Ok(me) => {
                self.token_rejected = false;
                self.set_me(me);
                self.lan = self.api.current_lan().await?;
                self.follow_events(app);
            }
            Err(Error::Unauthorized) => {
                self.token_rejected = true;
                self.me = None;
                self.stream.stop();
                self.lan = self.api.anonymous().current_lan().await?;
            }
            Err(error) => return Err(error),
        }
        Ok(())
    }

    /// Übernimmt einen neuen Stand vom Server.
    fn set_me(&mut self, me: Me) {
        self.me = Some((me, Instant::now()));
    }

    /// Der aktuelle Stand, oder [`Error::NotRegistered`] ohne Konto.
    fn registered(&self) -> Result<&Me> {
        self.me
            .as_ref()
            .map(|(me, _)| me)
            .ok_or(Error::NotRegistered)
    }

    /// Uhrzeit des Servers jetzt, hochgerechnet vom letzten Stand.
    fn server_now(&self) -> Option<i64> {
        let (me, received) = self.me.as_ref()?;
        let elapsed = i64::try_from(received.elapsed().as_millis()).unwrap_or(i64::MAX);
        Some(me.server_time.saturating_add(elapsed))
    }

    /// Startet den Ereignis-Stream, falls er nicht schon läuft.
    fn follow_events(&mut self, app: &AppHandle) {
        if let Some((me, _)) = &self.me {
            self.stream.ensure(app, &self.api, me);
        }
    }

    /// Der Stand für die Oberfläche.
    fn game(&self) -> Game {
        let me = self.me.as_ref().map(|(me, _)| Me {
            server_time: self.server_now().unwrap_or(me.server_time),
            ..me.clone()
        });
        Game {
            settings: self.store.local.settings,
            me,
            lan: self.lan.clone(),
            server_url: SERVER_URL,
            token_rejected: self.token_rejected,
        }
    }
}

/// Liefert die geöffnete Sitzung und öffnet sie beim ersten Mal.
async fn session<'a>(app: &AppHandle, slot: &'a mut Option<Session>) -> Result<&'a mut Session> {
    match slot {
        Some(session) => Ok(session),
        empty => Ok(empty.insert(Session::open(app).await?)),
    }
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
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    session.api.stage().await
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
