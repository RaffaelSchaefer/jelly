//! Der Weg zum Jelly-Server: Typen aus dem Vertrag und ein kleiner HTTP-Client.
//!
//! Der Vertrag steht in `apps/server/docs/api.md` und `apps/server/docs/openapi.json`. Der Server
//! darf jederzeit Felder, Ereignisse und Fehlercodes ergänzen. Deshalb haben die Typen hier kein
//! `deny_unknown_fields`, und unbekannte Fehlercodes zeigen einfach ihre `message`.

use reqwest::{Client, RequestBuilder, StatusCode};
use reqwest_eventsource::{CannotCloneRequestError, EventSource};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    error::{Error, Result},
    pet::{Action, Color},
};

/// Adresse des Servers. Beim Bauen per `JELLY_SERVER_URL` setzbar, sonst ein lokaler Server.
pub const SERVER_URL: &str = match option_env!("JELLY_SERVER_URL") {
    Some(url) => url,
    None => "http://localhost:8080",
};

/// Die LAN, an der ein Konto zuletzt teilgenommen hat.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanInfo {
    /// Kurzname, zum Beispiel `ucb-2026`.
    pub slug: String,
    /// Anzeigename.
    pub name: String,
    /// Ob sie gerade läuft.
    pub active: bool,
}

/// Zeitraum einer LAN, Zeiten in Unix-Millisekunden.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanPeriod {
    /// Kurzname.
    pub slug: String,
    /// Anzeigename.
    pub name: String,
    /// Beginn.
    pub starts_at: i64,
    /// Ende.
    pub ends_at: i64,
}

/// Antwort von `GET /v1/lans/current`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanStatus {
    /// Uhrzeit des Servers in Unix-Millisekunden.
    pub server_time: i64,
    /// Die laufende LAN.
    pub current: Option<LanPeriod>,
    /// Die nächste LAN.
    pub next: Option<LanPeriod>,
    /// Ob dieses Konto an der laufenden LAN teilnimmt. `None` ohne Token oder ohne LAN.
    pub joined: Option<bool>,
}

/// Abklingzeiten und Kontingent der Selbstmeldungen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reports {
    /// Ab wann Essen wieder zählt, 0 heißt sofort.
    pub food_ready_at: i64,
    /// Ab wann ein Getränk wieder zählt, 0 heißt sofort.
    pub drink_ready_at: i64,
    /// Wie viele Meldungen im laufenden Fenster noch frei sind.
    pub reports_left: i64,
}

/// Ein verdienter Erfolg.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarnedAchievement {
    /// Stabiler Schlüssel, passend zum Katalog.
    pub key: String,
    /// Titel auf Deutsch.
    pub title: String,
    /// Bei LAN-Erfolgen die LAN, sonst `None`.
    pub lan_slug: Option<String>,
    /// Wann er verdient wurde.
    pub earned_at: i64,
    /// Bei Rekord-Erfolgen der beste Wert.
    #[serde(default)]
    pub best: Option<i64>,
    /// Einheit zu [`EarnedAchievement::best`].
    #[serde(default)]
    pub record_unit: Option<String>,
}

/// Abzeichen für eine besuchte LAN.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Badge {
    /// Kurzname der LAN.
    pub slug: String,
    /// Anzeigename der LAN.
    pub name: String,
}

/// Auszeichnung von der Orga.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Award {
    /// Freitext der Orga.
    pub title: String,
    /// Cosmetic, das dazu freigeschaltet wurde.
    pub cosmetic_key: Option<String>,
    /// Wann sie vergeben wurde.
    pub given_at: i64,
}

/// Stand eines Spielers (`PlayerState`), wie `GET /v1/me` und die meisten Aktionen ihn liefern.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Me {
    /// Uhrzeit des Servers. Countdowns rechnen damit statt mit der Uhr des Geräts.
    pub server_time: i64,
    /// Ab hier öffnet die App den Ereignis-Stream.
    pub last_event_id: i64,
    /// Spieler-ID, auch `player_id` in Ereignissen.
    pub id: i64,
    /// Anzeigename.
    pub name: String,
    /// Farbe als Schlüssel aus dem Katalog.
    pub color: String,
    /// Angelegtes Cosmetic.
    pub cosmetic: Option<String>,
    /// Von der Orga ausgeblendet.
    pub hidden: bool,
    /// Jüngste LAN des Kontos.
    pub lan: Option<LanInfo>,
    /// XP in dieser LAN.
    pub xp: i64,
    /// Level in dieser LAN.
    pub level: i64,
    /// XP über alle LANs.
    pub total_xp: i64,
    /// Ab wann ein Stupser wieder XP gibt. `None` außerhalb einer laufenden LAN.
    pub next_poke_at: Option<i64>,
    /// Stand der Selbstmeldungen. `None` außerhalb einer laufenden LAN.
    pub reports: Option<Reports>,
    /// Hochgehaltenes Schild.
    pub sign: Option<String>,
    /// Bei wem das Jelly gerade steht.
    pub follow_player_id: Option<i64>,
    /// Anzahl besuchter LANs.
    pub lans_attended: i64,
    /// Ein Abzeichen je besuchter LAN.
    pub badges: Vec<Badge>,
    /// Cosmetics, die der Spieler tragen darf.
    pub cosmetics: Vec<String>,
    /// Verdiente Erfolge.
    pub achievements: Vec<EarnedAchievement>,
    /// Auszeichnungen der Orga.
    pub awards: Vec<Award>,
}

/// Ein Jelly aus `GET /v1/stage`. Bereich und Heimplatz braucht nur die Bühne selbst.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StagePlayer {
    /// Spieler-ID, auch Ziel von `PUT /v1/follow`.
    pub id: i64,
    /// Anzeigename.
    pub name: String,
    /// Farbe als Schlüssel aus dem Katalog.
    pub color: String,
    /// Angelegtes Cosmetic.
    pub cosmetic: Option<String>,
    /// Level in dieser LAN.
    pub level: i64,
    /// Hochgehaltenes Schild.
    pub sign: Option<String>,
    /// Bei wem das Jelly gerade steht.
    pub follow_player_id: Option<i64>,
    /// Letztes Lebenszeichen.
    pub last_seen_at: i64,
}

/// Antwort von `GET /v1/stage`, ohne die Raumkarte.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stage {
    /// Uhrzeit des Servers.
    pub server_time: i64,
    /// Anwesende und nicht ausgeblendete Jellies, das eigene eingeschlossen.
    pub players: Vec<StagePlayer>,
}

/// Antwort von `POST /v1/actions`.
#[derive(Debug, Clone, Deserialize)]
pub struct ActionAnswer {
    /// Gewonnene XP, bei einem zu frühen Stupser 0.
    pub xp_gained: i64,
    /// Neuer Stand.
    pub me: Me,
}

/// Antwort von `POST /v1/event-codes/redeem`.
#[derive(Debug, Clone, Deserialize)]
pub struct Redeemed {
    /// Titel des Events.
    pub title: String,
    /// Gewonnene XP.
    pub xp_gained: i64,
    /// Neuer Stand.
    pub me: Me,
}

/// Ein Ereignis aus `GET /v1/events/stream`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerEvent {
    /// Fortlaufende ID, auch `Last-Event-ID` beim Wiederverbinden.
    pub id: i64,
    /// Art, zum Beispiel `xp.gained`.
    #[serde(rename = "type")]
    pub kind: String,
    /// Betroffener Spieler, bei Bühnen-Ereignissen `None`.
    pub player_id: Option<i64>,
    /// Inhalt je nach Art.
    pub payload: Value,
    /// Zeitpunkt in Unix-Millisekunden.
    pub created_at: i64,
}

/// Antwort von `GET /version`.
#[derive(Debug, Clone, Deserialize)]
pub struct Version {
    /// Version des Vertrags.
    pub api_version: String,
    /// Älteste App, die noch passt. Leer heißt keine Vorgabe.
    pub min_client_version: String,
}

/// Antwort von `POST /v1/register`.
#[derive(Debug, Clone, Deserialize)]
pub struct Registered {
    /// Token, das es nur dieses eine Mal gibt.
    pub token: String,
    /// Stand des neuen Kontos.
    pub me: Me,
}

/// Körper von `PATCH /v1/me`. Fehlende Felder bleiben unverändert, `cosmetic: ""` legt ab.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Profile {
    /// Neuer Name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Neue Farbe.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<Color>,
    /// Neues Cosmetic, leer zum Ablegen.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cosmetic: Option<String>,
}

/// Fehlerkörper des Servers: `{ "error": { "code", "message" } }`.
#[derive(Deserialize)]
struct Problem {
    /// Der eigentliche Fehler.
    error: ProblemDetails,
}

/// Inhalt von [`Problem`].
#[derive(Deserialize)]
struct ProblemDetails {
    /// Stabiler Code.
    code: String,
    /// Anzeigetext.
    message: String,
}

/// Übersetzt eine Fehlerantwort in einen [`Error`]. `401` heißt immer: Token gilt nicht.
pub(crate) fn parse_error(status: StatusCode, body: &str) -> Error {
    if status == StatusCode::UNAUTHORIZED {
        return Error::Unauthorized;
    }
    match serde_json::from_str::<Problem>(body) {
        Ok(problem) => Error::Server {
            code: problem.error.code,
            message: problem.error.message,
        },
        // Nur ein Proxy vor dem Server antwortet anders.
        Err(_) => Error::Server {
            code: "unknown".into(),
            message: format!("Der Server antwortet mit {status}."),
        },
    }
}

/// HTTP-Client für den Server, mit oder ohne Token.
#[derive(Clone)]
pub struct Api {
    /// Gemeinsamer Verbindungspool.
    http: Client,
    /// Bearer-Token des Spielers.
    token: Option<String>,
}

impl Api {
    /// Ein Client mit dem gespeicherten Token, falls es eins gibt.
    pub fn new(token: Option<String>) -> Self {
        Self {
            http: Client::new(),
            token,
        }
    }

    /// Derselbe Client ohne Token, für Wege, die auch ohne Konto gehen.
    pub fn anonymous(&self) -> Self {
        Self {
            http: self.http.clone(),
            token: None,
        }
    }

    /// Ob ein Token vorhanden ist.
    pub fn has_token(&self) -> bool {
        self.token.is_some()
    }

    /// Ersetzt das Token, etwa nach einer neuen Registrierung.
    pub fn set_token(&mut self, token: String) {
        self.token = Some(token);
    }

    /// Baut eine Anfrage an `path` und hängt das Token an, falls vorhanden.
    fn request(&self, method: reqwest::Method, path: &str) -> RequestBuilder {
        let request = self.http.request(method, format!("{SERVER_URL}{path}"));
        match &self.token {
            Some(token) => request.bearer_auth(token),
            None => request,
        }
    }

    /// Schickt `request` ab und liest die Antwort als `T`.
    async fn send<T: DeserializeOwned>(request: RequestBuilder) -> Result<T> {
        let response = request.send().await.map_err(Error::Network)?;
        let status = response.status();
        if status.is_success() {
            return response.json().await.map_err(Error::Network);
        }
        let body = response.text().await.unwrap_or_default();
        Err(parse_error(status, &body))
    }

    /// `GET` auf `path`.
    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        Self::send(self.request(reqwest::Method::GET, path)).await
    }

    /// `POST` auf `path` mit JSON-Körper.
    async fn post<T: DeserializeOwned>(&self, path: &str, body: &Value) -> Result<T> {
        Self::send(self.request(reqwest::Method::POST, path).json(body)).await
    }

    /// `GET /version`: Vertragsversion und älteste passende App.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`] oder [`Error::Server`].
    pub async fn version(&self) -> Result<Version> {
        self.get("/version").await
    }

    /// `GET /v1/catalog`: feste Listen. Rust reicht sie nur durch.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`] oder [`Error::Server`].
    pub async fn catalog(&self) -> Result<Value> {
        self.get("/v1/catalog").await
    }

    /// `GET /v1/lans/current`: welche LAN läuft, welche kommt.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn current_lan(&self) -> Result<LanStatus> {
        self.get("/v1/lans/current").await
    }

    /// `POST /v1/register`: legt ein Konto an. Schickt bewusst kein altes Token mit.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`] oder [`Error::Server`], etwa bei `name_taken` oder `invalid_code`.
    pub async fn register(&self, code: &str, name: &str, color: Color) -> Result<Registered> {
        let request = self
            .http
            .post(format!("{SERVER_URL}/v1/register"))
            .json(&json!({ "code": code, "name": name, "color": color }));
        Self::send(request).await
    }

    /// `POST /v1/lans/current/join`: ein vorhandenes Konto tritt der laufenden LAN bei.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn join(&self, code: &str) -> Result<Me> {
        self.post("/v1/lans/current/join", &json!({ "code": code }))
            .await
    }

    /// `GET /v1/me`: aktueller Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn me(&self) -> Result<Me> {
        self.get("/v1/me").await
    }

    /// `PATCH /v1/me`: Name, Farbe oder Cosmetic ändern.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn update_profile(&self, profile: &Profile) -> Result<Me> {
        Self::send(self.request(reqwest::Method::PATCH, "/v1/me").json(profile)).await
    }

    /// `POST /v1/presence`: hält das Jelly auf der Bühne, ohne XP.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn presence(&self) -> Result<Me> {
        Self::send(self.request(reqwest::Method::POST, "/v1/presence")).await
    }

    /// `POST /v1/emote`: spielt eine Geste und liefert den neuen Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa `emote_cooldown`.
    pub async fn emote(&self, key: &str) -> Result<Me> {
        self.post("/v1/emote", &json!({ "key": key })).await
    }

    /// `PUT /v1/sign`: hebt ein Schild aus dem Katalog und liefert den neuen Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa `unknown_sign`.
    pub async fn show_sign(&self, key: &str) -> Result<Me> {
        let body = json!({ "key": key });
        Self::send(self.request(reqwest::Method::PUT, "/v1/sign").json(&body)).await
    }

    /// `DELETE /v1/sign`: senkt das Schild und liefert den neuen Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn lower_sign(&self) -> Result<Me> {
        Self::send(self.request(reqwest::Method::DELETE, "/v1/sign")).await
    }

    /// `GET /v1/stage`: wer gerade auf der Bühne steht.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn stage(&self) -> Result<Stage> {
        self.get("/v1/stage").await
    }

    /// `PUT /v1/follow`: stellt das Jelly neben ein anderes und liefert den neuen Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa `invalid_follow`.
    pub async fn follow(&self, player_id: i64) -> Result<Me> {
        let body = json!({ "player_id": player_id });
        Self::send(self.request(reqwest::Method::PUT, "/v1/follow").json(&body)).await
    }

    /// `DELETE /v1/follow`: das Jelly geht weg und liefert den neuen Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn unfollow(&self) -> Result<Me> {
        Self::send(self.request(reqwest::Method::DELETE, "/v1/follow")).await
    }

    /// `POST /v1/actions`: Stupser oder Selbstmeldung.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa
    /// `report_cooldown`.
    pub async fn action(&self, action: Action) -> Result<ActionAnswer> {
        self.post("/v1/actions", &json!({ "action": action })).await
    }

    /// `POST /v1/event-codes/redeem`: Event-Code einlösen.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn redeem(&self, code: &str) -> Result<Redeemed> {
        self.post("/v1/event-codes/redeem", &json!({ "code": code }))
            .await
    }

    /// Öffnet den Ereignis-Stream ab `since`. Beim Wiederverbinden schickt `EventSource` selbst
    /// `Last-Event-ID`, das hat beim Server Vorrang vor `since`.
    ///
    /// # Fehler
    ///
    /// [`CannotCloneRequestError`], kommt bei einem `GET` ohne Körper nicht vor.
    pub fn stream(&self, since: i64) -> std::result::Result<EventSource, CannotCloneRequestError> {
        let path = format!("/v1/events/stream?since={since}");
        EventSource::new(self.request(reqwest::Method::GET, &path))
    }
}

#[cfg(test)]
mod tests;
