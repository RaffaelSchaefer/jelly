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
    pet::{Action, InviteState},
};

mod stage;
mod types;

pub use stage::*;
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

/// Übersetzt eine Fehlerantwort in einen [`Error`]. `401` heißt immer: Secret gilt nicht.
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

/// HTTP-Client für den Server, mit oder ohne Secret.
#[derive(Clone)]
pub struct Api {
    /// Gemeinsamer Verbindungspool.
    http: Client,
    /// Secret des Spielers, als Bearer-Header.
    secret: Option<String>,
}

impl Api {
    /// Ein Client mit dem gespeicherten Secret, falls es eins gibt.
    pub fn new(secret: Option<String>) -> Self {
        Self {
            http: Client::new(),
            secret,
        }
    }

    /// Derselbe Client ohne Secret, für Wege, die auch ohne Konto gehen.
    pub fn anonymous(&self) -> Self {
        Self {
            http: self.http.clone(),
            secret: None,
        }
    }

    /// Ob ein Secret vorhanden ist.
    pub fn has_secret(&self) -> bool {
        self.secret.is_some()
    }

    /// Ersetzt das Secret, etwa nach dem Einlösen eines Codes.
    pub fn set_secret(&mut self, secret: String) {
        self.secret = Some(secret);
    }

    /// Baut eine Anfrage an `path` und hängt das Secret an, falls vorhanden.
    fn request(&self, method: reqwest::Method, path: &str) -> RequestBuilder {
        let request = self.http.request(method, format!("{SERVER_URL}{path}"));
        match &self.secret {
            Some(secret) => request.bearer_auth(secret),
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

    /// `POST /v1/auth/redeem`: tauscht einen Code gegen ein Secret. Legt ein Konto an oder holt
    /// das vorhandene zurück. Schickt bewusst kein altes Secret mit.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`] oder [`Error::Server`], etwa bei `code_redeemed`, `name_taken` oder
    /// `invalid_code`.
    pub async fn redeem_access(&self, body: &AccessBody<'_>) -> Result<Access> {
        let request = self
            .http
            .post(format!("{SERVER_URL}/v1/auth/redeem"))
            .json(body);
        Self::send(request).await
    }

    /// `GET /v1/players/me`: aktueller Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn me(&self) -> Result<Me> {
        self.get("/v1/players/me").await
    }

    /// `PATCH /v1/players/me`: Name oder Farbe ändern.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn update_profile(&self, profile: &Profile) -> Result<Me> {
        let request = self.request(reqwest::Method::PATCH, "/v1/players/me");
        Self::send(request.json(profile)).await
    }

    /// `PUT /v1/cosmetics/equipped`: legt ein Cosmetic auf einen Platz oder leert ihn.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa `unknown_slot`,
    /// `unknown_cosmetic`, `invalid_cosmetic_color` oder `cosmetic_locked`.
    pub async fn equip(&self, body: &EquipBody) -> Result<Me> {
        let request = self.request(reqwest::Method::PUT, "/v1/cosmetics/equipped");
        Self::send(request.json(body)).await
    }

    /// `POST /v1/presence`: hält das Jelly auf der Bühne, ohne XP.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn presence(&self) -> Result<Me> {
        Self::send(self.request(reqwest::Method::POST, "/v1/presence")).await
    }

    /// `POST /v1/emotes`: spielt eine Geste und liefert den neuen Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa `emote_cooldown`.
    pub async fn emote(&self, key: &str) -> Result<Me> {
        self.post("/v1/emotes", &json!({ "key": key })).await
    }

    /// `PUT /v1/signs/current`: hebt ein Schild aus dem Katalog und liefert den neuen Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa `unknown_sign`.
    pub async fn show_sign(&self, key: &str) -> Result<Me> {
        let body = json!({ "key": key });
        Self::send(
            self.request(reqwest::Method::PUT, "/v1/signs/current")
                .json(&body),
        )
        .await
    }

    /// `DELETE /v1/signs/current`: senkt das Schild und liefert den neuen Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn lower_sign(&self) -> Result<Me> {
        Self::send(self.request(reqwest::Method::DELETE, "/v1/signs/current")).await
    }

    /// `GET /v1/stage`: wer gerade auf der Bühne steht und wie die Jellies laufen.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn stage(&self) -> Result<Stage> {
        let request = self.request(reqwest::Method::GET, "/v1/stage");
        // Nur hier: Der Stream teilt sich den Client und darf beliebig lange offen bleiben.
        Self::send(request.timeout(STAGE_TIMEOUT)).await
    }

    /// `POST /v1/trips/follow`: das Jelly läuft einem anderen nach und liefert den neuen Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa `invalid_follow`.
    pub async fn follow(&self, player_id: i64) -> Result<Me> {
        self.post("/v1/trips/follow", &json!({ "player_id": player_id }))
            .await
    }

    /// `DELETE /v1/trips/current`: beendet Folgen und Ausflug und liefert den neuen Stand.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn end_trip(&self) -> Result<Me> {
        Self::send(self.request(reqwest::Method::DELETE, "/v1/trips/current")).await
    }

    /// `POST /v1/pokes`: ein Stupser. Ein zu früher ist kein Fehler, sondern `xp_gained: 0`.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn poke(&self) -> Result<ActionAnswer> {
        Self::send(self.request(reqwest::Method::POST, "/v1/pokes")).await
    }

    /// `POST /v1/reports`: selbst gemeldetes Essen oder Getränk.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa
    /// `report_cooldown`.
    pub async fn report(&self, kind: Action) -> Result<ActionAnswer> {
        self.post("/v1/reports", &json!({ "kind": kind })).await
    }

    /// `POST /v1/event-codes/redemptions`: Event-Code einlösen.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`].
    pub async fn redeem_event_code(&self, code: &str) -> Result<Redeemed> {
        self.post("/v1/event-codes/redemptions", &json!({ "code": code }))
            .await
    }

    /// `POST /v1/partner-emotes`: fordert ein Jelly in der Nähe zu einem Partner-Emote auf.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa `too_far`,
    /// `partner_emote_open` oder `unknown_partner_emote`.
    pub async fn invite_partner(&self, key: &str, partner_id: i64) -> Result<PartnerInviteResult> {
        let body = json!({ "key": key, "partner_ids": [partner_id] });
        self.post("/v1/partner-emotes", &body).await
    }

    /// `PATCH /v1/partner-emotes`: nimmt eine Aufforderung an, lehnt sie ab oder zieht sie zurück.
    ///
    /// # Fehler
    ///
    /// [`Error::Network`], [`Error::Unauthorized`] oder [`Error::Server`], etwa `too_far` oder
    /// `partner_emote_closed`.
    pub async fn answer_partner(&self, id: i64, state: InviteState) -> Result<PartnerInviteResult> {
        let body = json!({ "id": id, "state": state });
        let request = self.request(reqwest::Method::PATCH, "/v1/partner-emotes");
        Self::send(request.json(&body)).await
    }

    /// Öffnet den Stream ab `since`, mit Ereignissen und Wegen. Beim Wiederverbinden schickt
    /// `EventSource` selbst `Last-Event-ID`, das hat beim Server Vorrang vor `since`.
    ///
    /// # Fehler
    ///
    /// [`CannotCloneRequestError`], kommt bei einem `GET` ohne Körper nicht vor.
    pub fn stream(&self, since: i64) -> std::result::Result<EventSource, CannotCloneRequestError> {
        let path = format!("/v1/stage/events?since={since}");
        EventSource::new(self.request(reqwest::Method::GET, &path))
    }
}

#[cfg(test)]
mod tests;
