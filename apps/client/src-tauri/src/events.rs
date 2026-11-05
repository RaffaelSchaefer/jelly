//! Leitet Ereignisse und Wege aus `GET /v1/stage/events` an die Oberfläche weiter.
//!
//! Der Stream ist für alle Spieler gleich. Zum Pet gehen nur Ereignisse zum eigenen Jelly durch, als
//! Tauri-Ereignis [`EVENT_NAME`]. Die Oberfläche lädt danach den Stand neu, denn Ereignisse tragen
//! keine Namen und keinen vollständigen Stand. Nach `player.removed` lehnt der Server das Secret dabei
//! ab, und die Oberfläche fragt nach einem neuen Code. Die Karte hört als [`STAGE_EVENT_NAME`] alles,
//! dazu als [`STAGE_MOVE_NAME`] die Wege. [`STREAM_RESET_NAME`] geht an beide.

use futures_util::StreamExt;
use reqwest::StatusCode;
use reqwest_eventsource::{Error as StreamError, Event, EventSource};
use serde::Serialize;
use serde_json::Value;
use tauri::{async_runtime::JoinHandle, AppHandle, Emitter};

use crate::{
    api::{Api, Me, Move, ServerEvent},
    map,
};

/// Name des Tauri-Ereignisses, auf das `src/backend.ts` hört.
pub const EVENT_NAME: &str = "server-event";

/// Name des Tauri-Ereignisses für die Karte: alle Ereignisse, solange ihr Fenster offen ist.
///
/// Ein eigener Name, kein Ziel-Fenster: `listen` hört auf jedes Ziel, das Pet-Fenster bekäme sie also
/// mit und läse je Ereignis seinen Stand neu.
pub const STAGE_EVENT_NAME: &str = "stage-event";

/// Name des Tauri-Ereignisses für die Karte: ein Jelly läuft los.
pub const STAGE_MOVE_NAME: &str = "stage-move";

/// Name des Tauri-Ereignisses, wenn der Server für diesen Stream Ereignisse verworfen hat. Pet und
/// Karte lesen dann ihren Stand neu. Dasselbe braucht das Ende eines Ausflugs, das der Server nicht
/// meldet.
pub const STREAM_RESET_NAME: &str = "stream-reset";

/// Art der Nachricht, wenn ein Jelly losläuft. Sie hat keine ID und steht nicht im Ereignis-Log.
const MOVE_MESSAGE: &str = "move";

/// Art der Nachricht, wenn der Server Ereignisse für diesen Stream verworfen hat.
const RESET_MESSAGE: &str = "reset";

/// Ereignisarten zum eigenen Jelly, die die Oberfläche bekommt.
/// Emotes starten lokal aus der Befehlsantwort, damit der Stream sie nicht doppelt abspielt.
/// `sign.changed` bleibt draußen: Nur die eigene App ändert das Schild, ihre Antwort trägt den Stand.
/// `follow.changed` kommt durch: Der Server darf das Dazustellen von sich aus beenden.
/// `partner.emote` trägt den Annehmenden als `player_id`, der Auffordernde steht in
/// `payload.partner_id`. Nur er braucht es: Der Annehmende hat die Geste schon aus seiner Antwort.
/// `trip.changed` kommt durch: Die Karte startet den Ausflug, das Pet sagt etwas dazu.
/// `stack.changed` bleibt draußen, das Pet zeigt Stapel noch nicht.
const OWN_EVENTS: [&str; 8] = [
    "xp.gained",
    "level.up",
    "achievement.earned",
    "award.given",
    "player.updated",
    "player.hidden",
    "follow.changed",
    "trip.changed",
];

/// Ereignis, wenn ein Konto gelöscht wurde. Es trägt den Spieler in `payload`, nicht in `player_id`.
const PLAYER_REMOVED: &str = "player.removed";

/// Ereignis, wenn jemand die eigene Aufforderung annimmt.
const PARTNER_EMOTE: &str = "partner.emote";

/// Ereignis, wenn sich eine Aufforderung ändert. Es zählt für beide Seiten, `player_id` nennt nur,
/// wer gehandelt hat.
const PARTNER_INVITE: &str = "partner_emote.updated";

/// Was eine Nachricht des Streams bedeutet.
#[derive(Debug)]
enum StreamMessage {
    /// Ein Ereignis aus dem Log.
    Event(ServerEvent),
    /// Ein Jelly läuft los.
    Move(Move),
    /// Der Stand muss neu gelesen werden.
    Reset,
    /// Etwas, das diese App nicht kennt oder nicht lesen kann.
    Other,
}

/// Liest eine Nachricht anhand ihrer Art. Ein neuerer Server darf Unbekanntes schicken.
fn parse_message(kind: &str, data: &str) -> StreamMessage {
    match kind {
        MOVE_MESSAGE => {
            serde_json::from_str(data).map_or(StreamMessage::Other, StreamMessage::Move)
        }
        RESET_MESSAGE => StreamMessage::Reset,
        _ => serde_json::from_str(data).map_or(StreamMessage::Other, StreamMessage::Event),
    }
}

/// Ob die Aufforderung in `payload` an `player_id` geht.
fn is_invited(payload: &Value, player_id: i64) -> bool {
    payload
        .get("partner_ids")
        .and_then(Value::as_array)
        .is_some_and(|ids| ids.iter().any(|id| id.as_i64() == Some(player_id)))
}

/// Ob die Aufforderung in `payload` von `player_id` stammt oder an `player_id` geht.
fn concerns_invite(payload: &Value, player_id: i64) -> bool {
    payload.get("from_id").and_then(Value::as_i64) == Some(player_id)
        || is_invited(payload, player_id)
}

/// Ob die Karte wegen `event` zugeht, denn beides zeigt nur das Pet: eine neue Aufforderung an
/// `player_id` und das Duett, wenn jemand die eigene Aufforderung angenommen hat.
fn closes_map(event: &ServerEvent, player_id: i64) -> bool {
    match event.kind.as_str() {
        PARTNER_EMOTE => event.payload.get("partner_id").and_then(Value::as_i64) == Some(player_id),
        PARTNER_INVITE => {
            event.payload.get("state").and_then(Value::as_str) == Some("pending")
                && is_invited(&event.payload, player_id)
        }
        _ => false,
    }
}

/// Ob `event` das Jelly von `player_id` betrifft und an die Oberfläche soll.
fn is_own_event(event: &ServerEvent, player_id: i64) -> bool {
    if event.kind == PLAYER_REMOVED {
        return event.payload.get("player_id").and_then(Value::as_i64) == Some(player_id);
    }
    if event.kind == PARTNER_EMOTE {
        return event.payload.get("partner_id").and_then(Value::as_i64) == Some(player_id);
    }
    if event.kind == PARTNER_INVITE {
        return concerns_invite(&event.payload, player_id);
    }
    event.player_id == Some(player_id) && OWN_EVENTS.contains(&event.kind.as_str())
}

/// Die laufende Weiterleitung, höchstens eine je App.
#[derive(Default)]
pub struct EventStream {
    /// Task, der den Stream liest.
    task: Option<JoinHandle<()>>,
}

impl EventStream {
    /// Startet die Weiterleitung für `me`, falls sie nicht schon läuft.
    ///
    /// Beginnt bei `me.last_event_id`, damit zwischen `GET /players/me` und dem Stream nichts verloren
    /// geht. Nach einem Abbruch verbindet `EventSource` selbst neu, mit Pause und `Last-Event-ID`.
    pub fn ensure(&mut self, app: &AppHandle, api: &Api, me: &Me) {
        if self.is_running() {
            return;
        }
        let source = match api.stream(me.last_event_id) {
            Ok(source) => source,
            Err(error) => {
                eprintln!("Ereignis-Stream konnte nicht starten: {error}");
                return;
            }
        };
        let task = tauri::async_runtime::spawn(forward(app.clone(), source, me.id));
        self.task = Some(task);
    }

    /// Ob der Task noch liest. Eine Antwort außer `200` beendet den Stream dauerhaft.
    pub fn is_running(&self) -> bool {
        self.task
            .as_ref()
            .is_some_and(|task| !task.inner().is_finished())
    }

    /// Beendet die Weiterleitung, etwa vor einem Wechsel des Secrets.
    pub fn stop(&mut self) {
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}

/// Gibt etwas an die Oberfläche weiter.
pub(crate) fn emit_to_ui<T: Serialize + Clone>(app: &AppHandle, name: &str, payload: T) {
    if let Err(error) = app.emit(name, payload) {
        eprintln!("Ereignis konnte nicht weitergegeben werden: {error}");
    }
}

/// Reicht eine Nachricht weiter: eigene Ereignisse ans Pet, alle Ereignisse und Wege an die Karte,
/// falls sie offen ist.
fn dispatch(app: &AppHandle, message: StreamMessage, player_id: i64) {
    match message {
        StreamMessage::Event(event) => {
            if is_own_event(&event, player_id) {
                emit_to_ui(app, EVENT_NAME, &event);
            }
            if map::is_open(app) {
                emit_to_ui(app, STAGE_EVENT_NAME, &event);
            }
            if closes_map(&event, player_id) {
                map::close(app);
            }
        }
        StreamMessage::Move(walk) => {
            if map::is_open(app) {
                emit_to_ui(app, STAGE_MOVE_NAME, &walk);
            }
        }
        StreamMessage::Reset => emit_to_ui(app, STREAM_RESET_NAME, ()),
        StreamMessage::Other => {}
    }
}

/// Liest den Stream, bis der Server das Secret ablehnt.
async fn forward(app: AppHandle, mut source: EventSource, player_id: i64) {
    while let Some(item) = source.next().await {
        match item {
            Ok(Event::Open) => {}
            Ok(Event::Message(message)) => {
                let parsed = parse_message(&message.event, &message.data);
                dispatch(&app, parsed, player_id);
            }
            // Nach `401` hilft kein neuer Versuch. Die nächste Aktion zeigt den Fehler an.
            Err(StreamError::InvalidStatusCode(StatusCode::UNAUTHORIZED, _)) => source.close(),
            // Abbrüche versucht `EventSource` mit Pause selbst erneut. Nach einer anderen Antwort
            // als `200` endet die Schleife, dann startet das nächste Neuladen den Stream wieder.
            Err(_) => {}
        }
    }
}

#[cfg(test)]
mod tests;
