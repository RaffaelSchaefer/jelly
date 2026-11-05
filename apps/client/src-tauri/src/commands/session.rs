//! Öffnet und hält die Sitzung: lokaler Stand, Server-Verbindung und aktueller Spielstand.

use std::time::Instant;

use serde::Serialize;
use tauri::{async_runtime::Mutex, AppHandle, Manager};

use crate::{
    api::{Api, LanStatus, Me, SERVER_URL},
    error::{Error, Result},
    events::EventStream,
    map,
    pet::{client_outdated, Settings, CLIENT_VERSION},
    store::Store,
};

/// Die Sitzung als Tauri-State.
///
/// Wird erst beim ersten Befehl geöffnet, weil das App-Datenverzeichnis erst zur Laufzeit bekannt
/// ist. Der Mutex sorgt dafür, dass Befehle nacheinander laufen und sich nicht überholen.
#[derive(Default)]
pub struct GameState(pub(super) Mutex<Option<Session>>);

/// Alles, was zwischen zwei Befehlen erhalten bleibt.
pub(super) struct Session {
    /// Lokaler Stand mit Secret und Einstellungen.
    pub(super) store: Store,
    /// Client für den Server.
    pub(super) api: Api,
    /// Letzter Stand vom Server und wann er ankam.
    me: Option<(Me, Instant)>,
    /// Welche LAN läuft.
    pub(super) lan: LanStatus,
    /// Ob der Server das gespeicherte Secret abgelehnt hat.
    pub(super) secret_rejected: bool,
    /// Weiterleitung der Server-Ereignisse an die Oberfläche.
    pub(super) stream: EventStream,
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
    /// Ob der Server das gespeicherte Secret abgelehnt hat. Dann hilft nur ein neuer Code.
    secret_rejected: bool,
}

impl Session {
    /// Öffnet `jelly.json`, prüft die App-Version beim Server und lädt den Stand.
    ///
    /// # Fehler
    ///
    /// Fehler beim Laden des lokalen Stands, eine veraltete App oder ein Netzwerk-/Serverfehler.
    async fn open(app: &AppHandle) -> Result<Self> {
        let directory = app.path().app_data_dir().map_err(Error::DataDir)?;
        let store = Store::open(directory.join("jelly.json"))?;
        let api = Api::new(store.local.secret.clone());
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
            secret_rejected: false,
            stream: EventStream::default(),
        };
        session.refresh(app).await?;
        Ok(session)
    }

    /// Liest Stand und LAN neu. Ein abgelehntes Secret wird gemerkt, aber nicht gelöscht.
    ///
    /// # Fehler
    ///
    /// Netzwerk- oder Serverfehler beim Lesen des Spielstands oder der laufenden LAN.
    pub(super) async fn refresh(&mut self, app: &AppHandle) -> Result<()> {
        if !self.api.has_secret() {
            self.lan = self.api.current_lan().await?;
            return Ok(());
        }
        match self.api.me().await {
            Ok(me) => {
                self.secret_rejected = false;
                self.set_me(me);
                self.lan = self.api.current_lan().await?;
                self.follow_events(app);
            }
            Err(Error::Unauthorized) => {
                self.secret_rejected = true;
                self.me = None;
                self.stream.stop();
                // Ohne Konto bekäme die Karte keine Daten mehr.
                map::close(app);
                self.lan = self.api.anonymous().current_lan().await?;
            }
            Err(error) => return Err(error),
        }
        Ok(())
    }

    /// Übernimmt einen neuen Stand vom Server.
    pub(super) fn set_me(&mut self, me: Me) {
        self.me = Some((me, Instant::now()));
    }

    /// Der aktuelle Stand, oder [`Error::NotRegistered`] ohne Konto.
    ///
    /// # Fehler
    ///
    /// [`Error::NotRegistered`], wenn kein Spielstand geladen ist.
    pub(super) fn registered(&self) -> Result<&Me> {
        self.me
            .as_ref()
            .map(|(me, _)| me)
            .ok_or(Error::NotRegistered)
    }

    /// Uhrzeit des Servers jetzt, hochgerechnet vom letzten Stand.
    pub(super) fn server_now(&self) -> Option<i64> {
        let (me, received) = self.me.as_ref()?;
        let elapsed = i64::try_from(received.elapsed().as_millis()).unwrap_or(i64::MAX);
        Some(me.server_time.saturating_add(elapsed))
    }

    /// Startet den Ereignis-Stream, falls er nicht schon läuft. Ohne Teilnahme an der laufenden
    /// LAN antwortet der Server mit `409`, dann bleibt er zu.
    pub(super) fn follow_events(&mut self, app: &AppHandle) {
        if self.lan.joined != Some(true) {
            return;
        }
        if let Some((me, _)) = &self.me {
            self.stream.ensure(app, &self.api, me);
        }
    }

    /// Der Stand für die Oberfläche.
    pub(super) fn game(&self) -> Game {
        let me = self.me.as_ref().map(|(me, _)| Me {
            server_time: self.server_now().unwrap_or(me.server_time),
            ..me.clone()
        });
        Game {
            settings: self.store.local.settings,
            me,
            lan: self.lan.clone(),
            server_url: SERVER_URL,
            secret_rejected: self.secret_rejected,
        }
    }
}

/// Liefert die geöffnete Sitzung und öffnet sie beim ersten Mal.
///
/// # Fehler
///
/// Dieselben Fehler wie [`Session::open`], wenn noch keine Sitzung geöffnet ist.
pub(super) async fn session<'a>(
    app: &AppHandle,
    slot: &'a mut Option<Session>,
) -> Result<&'a mut Session> {
    match slot {
        Some(session) => Ok(session),
        empty => Ok(empty.insert(Session::open(app).await?)),
    }
}
