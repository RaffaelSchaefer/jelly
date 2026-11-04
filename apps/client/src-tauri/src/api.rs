//! Der Weg zum Jelly-Server: Typen aus dem Vertrag und ein kleiner HTTP-Client.
//!
//! Der Vertrag steht in `apps/server/docs/api.md` und `apps/server/docs/openapi.json`. Der Server
//! darf jederzeit Felder, Ereignisse und Fehlercodes ergänzen. Deshalb haben die Typen hier kein
//! `deny_unknown_fields`, und unbekannte Fehlercodes zeigen einfach ihre `message`.

use std::time::Duration;

use reqwest::{Client, RequestBuilder, StatusCode};
use reqwest_eventsource::{CannotCloneRequestError, EventSource};
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::{json, Value};

use crate::{
    error::{Error, Result},
    pet::{Action, Color},
};

mod types;

pub use types::*;

/// Adresse des Servers. Beim Bauen per `JELLY_SERVER_URL` setzbar, sonst ein lokaler Server.
pub const SERVER_URL: &str = match option_env!("JELLY_SERVER_URL") {
    Some(url) => url,
    None => "http://localhost:8080",
};

/// Solange darf `GET /v1/stage` dauern. Die Karte liest nacheinander, eine hängende Anfrage hielte
/// sie sonst an.
const STAGE_TIMEOUT: Duration = Duration::from_secs(5);

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
        let request = self.request(reqwest::Method::GET, "/v1/stage");
        // Nur hier: Der Stream teilt sich den Client und darf beliebig lange offen bleiben.
        Self::send(request.timeout(STAGE_TIMEOUT)).await
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

    /// `POST /v1/partner-emote`: startet ein Partner-Emote und liefert den Code für den Partner.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa
    /// `unknown_partner_emote` oder `partner_codes_busy`.
    pub async fn start_partner_emote(&self, key: &str) -> Result<PartnerOffer> {
        self.post("/v1/partner-emote", &json!({ "key": key })).await
    }

    /// `POST /v1/partner-emote/join`: tritt mit dem Code eines anderen Jellys bei.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa
    /// `invalid_partner_code` oder `partner_self`.
    pub async fn join_partner_emote(&self, code: &str) -> Result<PartnerResult> {
        self.post("/v1/partner-emote/join", &json!({ "code": code }))
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
