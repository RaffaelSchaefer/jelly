//! Leitet Ereignisse und Wege aus `GET /v1/stage/events` an die Oberfläche weiter.
//!
//! Der Stream ist für alle Spieler gleich. Zum Pet gehen nur Ereignisse zum eigenen Jelly durch, als
//! Tauri-Ereignis [`EVENT_NAME`], beim Stapel auch die der anderen darauf ([`OwnStack`]), bei der
//! Polonaise auch das Dazustellen der anderen darin ([`Follows`]). Dazu kommt, was allen gilt, etwa
//! geänderte Regeln oder Beginn und Ende der Jelly-News ([`NewsOnAir`]). Die Oberfläche lädt danach den Stand neu, denn Ereignisse tragen keine Namen und
//! keinen vollständigen Stand. Nach `player.removed` lehnt der Server das Secret dabei ab, und die Oberfläche fragt nach
//! einem neuen Code. Die Karte hört als [`STAGE_EVENT_NAME`] alles, dazu als [`STAGE_MOVE_NAME`] die
//! Wege. [`STREAM_RESET_NAME`] geht an beide.

use std::collections::{HashMap, HashSet};

use futures_util::StreamExt;
use reqwest::StatusCode;
use reqwest_eventsource::{Error as StreamError, Event, EventSource};
use serde::Serialize;
use serde_json::Value;
use tauri::{async_runtime::JoinHandle, AppHandle, Emitter};

use crate::{
    api::{Api, Me, Move, ServerEvent},
    popout,
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
/// Karte lesen dann ihren Stand neu.
pub const STREAM_RESET_NAME: &str = "stream-reset";

/// Art der Nachricht, wenn ein Jelly losläuft. Sie hat keine ID und steht nicht im Ereignis-Log.
const MOVE_MESSAGE: &str = "move";

/// Art der Nachricht, wenn der Server Ereignisse für diesen Stream verworfen hat.
const RESET_MESSAGE: &str = "reset";

/// Ereignisarten zum eigenen Jelly, die die Oberfläche bekommt.
/// Emotes starten lokal aus der Befehlsantwort, damit der Stream sie nicht doppelt abspielt.
/// `sign.changed` bleibt draußen: Nur die eigene App ändert das Schild, ihre Antwort trägt den Stand.
/// `follow.changed` kommt durch: Der Server darf das Dazustellen von sich aus beenden. Das der
/// anderen in derselben Polonaise lässt [`Follows`] durch.
/// `partner.emote` trägt den Annehmenden als `player_id`, der Auffordernde steht in
/// `payload.partner_id`. Nur er braucht es: Der Annehmende hat die Geste schon aus seiner Antwort.
/// `trip.changed` kommt durch: Die Karte startet den Ausflug, das Pet sagt etwas dazu. Beide melden
/// auch das Ende, wenn die Zeit abläuft, die App braucht dafür keine Uhr.
/// `stack.changed` fehlt hier: Ob es zum eigenen Jelly gehört, entscheidet [`OwnStack`].
/// `coins.gained` und `cosmetic.purchased` kommen durch: Pet und Shop lesen danach ihre Münzen neu.
const OWN_EVENTS: [&str; 10] = [
    "xp.gained",
    "level.up",
    "coins.gained",
    "cosmetic.purchased",
    "achievement.earned",
    "award.given",
    "player.updated",
    "player.hidden",
    "follow.changed",
    "trip.changed",
];

/// Ereignis, wenn ein Konto gelöscht wurde. Es trägt den Spieler in `payload`, nicht in `player_id`.
const PLAYER_REMOVED: &str = "player.removed";

/// Ereignis, wenn die Orga die Regeln ändert. Es gilt allen, die Oberfläche liest die LAN neu.
const RULES_CHANGED: &str = "rules.changed";

/// Ereignis, wenn die Orga den Zeitplan ändert. Es gilt allen, die Oberfläche liest ihn neu.
const SCHEDULE_CHANGED: &str = "schedule.changed";

/// Ereignis, wenn Funkelbarts Hut gestohlen wird oder zurückgeht. Es gilt allen: Jeder Shop zeigt den
/// Zauberer mit oder ohne Hut, und das Pet des Trägers liest seinen Kopf neu. Karte und Shop bleiben
/// dabei offen.
const WIZARD_HAT_CHANGED: &str = "wizard_hat.changed";

/// Ereignis, wenn ein Gathering beginnt oder endet: Essens-Event, Siegerehrung oder Jelly-News.
const GATHERING_CHANGED: &str = "gathering.changed";

/// Art des Gatherings, das die Jelly-News auf der Bühne zeigt.
const NEWS_KIND: &str = "news";

/// Ereignis, wenn jemand die eigene Aufforderung annimmt.
const PARTNER_EMOTE: &str = "partner.emote";

/// Ereignis, wenn sich eine Aufforderung ändert. Es zählt für beide Seiten, `player_id` nennt nur,
/// wer gehandelt hat.
const PARTNER_INVITE: &str = "partner_emote.updated";

/// Ereignis, wenn jemand auf einen Stapel klettert, absteigt oder der Stapel auseinanderfällt.
const STACK_CHANGED: &str = "stack.changed";

/// Der Stapel, auf dem das eigene Jelly steht, soweit dieser Stream es mitbekommen hat.
///
/// Ein Stapel, der weiter steht, kommt in `stack.changed` ganz. Einer, der weg ist, trägt nur
/// `{"id"}`: Ob das den eigenen Stapel trifft, weiß nur, wer ihn sich gemerkt hat. Der Stand lebt
/// nur im Stream: Ein neuer (nach [`EventStream::stop`] oder einer Antwort außer `200`) beginnt
/// ohne. Steht das Jelly dann schon oben, erfährt das Pet vom Ende des Stapels erst wieder, nachdem
/// sich an ihm etwas geändert hat.
#[derive(Debug, Default)]
struct OwnStack(Option<i64>);

impl OwnStack {
    /// Ob `event` den Stapel von `player_id` betrifft und ans Pet soll: Das Jelly steht darin,
    /// hat selbst etwas geändert, oder es ist der gemerkte Stapel. Merkt sich den Stapel oder
    /// vergisst ihn, sobald das Jelly nicht mehr darauf steht oder der Stapel weg ist.
    fn track(&mut self, event: &ServerEvent, player_id: i64) -> bool {
        if event.kind != STACK_CHANGED {
            return false;
        }
        let Some(stack_id) = event.payload.get("id").and_then(Value::as_i64) else {
            return false;
        };
        let members = event.payload.get("member_ids").and_then(Value::as_array);
        if members.is_some_and(|ids| ids.iter().any(|id| id.as_i64() == Some(player_id))) {
            self.0 = Some(stack_id);
            return true;
        }
        if self.0 != Some(stack_id) {
            return event.player_id == Some(player_id);
        }
        // Der gemerkte Stapel ohne das Jelly, oder er ist weg.
        self.0 = None;
        true
    }
}

/// Ereignis, wenn sich ein Jelly zu einem anderen stellt oder wieder geht.
const FOLLOW_CHANGED: &str = "follow.changed";

/// Wer wem nachläuft, Folgender zu Ziel: damit das Pet von seiner Polonaise erfährt.
///
/// Eine Polonaise entsteht und endet auch, wenn andere sich dazustellen oder gehen. Darum geht
/// `follow.changed` eines anderen Jellys ans Pet, wenn es vor oder nach dem Wechsel über solche
/// Folgen mit dem eigenen verbunden ist. Das ist nur ein Filter, damit nicht jedes Dazustellen in
/// der Halle jedes Pet weckt: Ob daraus eine Polonaise wird, liest das Pet danach von der Bühne
/// (`src/useConga.ts`).
///
/// Der Stand beginnt mit dem der Bühne ([`read_follows`]) und folgt danach dem Stream. Scheitert
/// dieses Lesen, beginnt er leer: Dann fehlt, wer schon vorher folgte, bis er sich neu dazustellt
/// oder geht. Ein Jelly, das die Bühne ohne `follow.changed` verlässt, bleibt bis dahin stehen. Dann
/// geht höchstens ein Ereignis zu viel ans Pet.
#[derive(Debug, Default)]
struct Follows(HashMap<i64, i64>);

impl Follows {
    /// Der Stand aus Paaren von Folgendem und Ziel.
    fn of(pairs: impl IntoIterator<Item = (i64, i64)>) -> Self {
        Self(pairs.into_iter().collect())
    }

    /// Alle Jellies, die über Folgen mit `player_id` verbunden sind, egal in welcher Richtung.
    fn around(&self, player_id: i64) -> HashSet<i64> {
        let mut group = HashSet::from([player_id]);
        // Je Runde wächst die Gruppe um mindestens ein Jelly, in einer Halle sind das wenige.
        loop {
            let size = group.len();
            for (&follower, &target) in &self.0 {
                if group.contains(&follower) || group.contains(&target) {
                    group.extend([follower, target]);
                }
            }
            if group.len() == size {
                return group;
            }
        }
    }

    /// Ob `event` das Dazustellen eines Jellys meldet, das vor oder nach diesem Wechsel mit
    /// `player_id` verbunden ist, und darum ans Pet soll. Merkt sich den Wechsel.
    fn track(&mut self, event: &ServerEvent, player_id: i64) -> bool {
        let Some(follower) = event.player_id.filter(|_| event.kind == FOLLOW_CHANGED) else {
            return false;
        };
        let before = self.around(player_id).contains(&follower);
        match event.payload.get("target_id").and_then(Value::as_i64) {
            Some(target) => self.0.insert(follower, target),
            None => self.0.remove(&follower),
        };
        before || self.around(player_id).contains(&follower)
    }
}

/// Liest von der Bühne, wer gerade wem folgt. Ohne Antwort beginnt der Stand leer, siehe
/// [`Follows`].
async fn read_follows(api: &Api) -> Follows {
    let Ok(stage) = api.stage().await else {
        return Follows::default();
    };
    let players = stage.players.iter();
    Follows::of(players.filter_map(|player| Some((player.id, player.follow.as_ref()?.player_id))))
}

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
    payload.get("partner_id").and_then(Value::as_i64) == Some(player_id)
}

/// Ob die Aufforderung in `payload` von `player_id` stammt oder an `player_id` geht.
fn concerns_invite(payload: &Value, player_id: i64) -> bool {
    payload.get("from_id").and_then(Value::as_i64) == Some(player_id)
        || is_invited(payload, player_id)
}

/// Ob Karte und Shop wegen `event` zugehen, denn beides zeigt nur das Pet: eine neue Aufforderung
/// an `player_id` und das Duett, wenn jemand die eigene Aufforderung angenommen hat.
fn closes_popouts(event: &ServerEvent, player_id: i64) -> bool {
    match event.kind.as_str() {
        PARTNER_EMOTE => event.payload.get("partner_id").and_then(Value::as_i64) == Some(player_id),
        PARTNER_INVITE => {
            event.payload.get("state").and_then(Value::as_str) == Some("pending")
                && is_invited(&event.payload, player_id)
        }
        _ => false,
    }
}

/// Ob `event` den Beginn der Jelly-News meldet.
fn is_news(event: &ServerEvent) -> bool {
    event.kind == GATHERING_CHANGED
        && event.payload.get("kind").and_then(Value::as_str) == Some(NEWS_KIND)
}

/// Ob gerade Jelly-News laufen, soweit dieser Stream es mitbekommen hat.
///
/// Ihr Beginn gilt allen: Das Pet sagt dazu, ob es vorliest, genannt wird oder nur zuschaut, und der
/// Vorleser spricht Beitrag für Beitrag. Karte und Shop bleiben dabei offen. Endet die Sendung
/// vorzeitig (`null`) oder ersetzt ein anderes Gathering sie, geht auch dieses Ereignis einmal ans
/// Pet, damit der Vorleser aufhört. Andere Gatherings ohne laufende News zeigt nur die Karte. Ein
/// reguläres Ende meldet der Server nicht: Dann geht das nächste Gathering einmal mit, das Pet ist da
/// längst fertig. Der Stand lebt wie bei [`OwnStack`] nur im Stream.
#[derive(Debug, Default)]
struct NewsOnAir(bool);

impl NewsOnAir {
    /// Ob `event` ans Pet soll: ein Beginn von News oder das erste Gathering danach. Merkt sich, ob
    /// danach News laufen.
    fn track(&mut self, event: &ServerEvent) -> bool {
        if event.kind != GATHERING_CHANGED {
            return false;
        }
        let news = is_news(event);
        let was = std::mem::replace(&mut self.0, news);
        news || was
    }
}

/// Was der Stream sich merkt, um Ereignisse anderer dem eigenen Jelly zuzuordnen.
#[derive(Debug, Default)]
struct Memory {
    /// Der eigene Stapel.
    own_stack: OwnStack,
    /// Ob Jelly-News laufen.
    news: NewsOnAir,
    /// Wer wem nachläuft.
    follows: Follows,
}

/// Ob `event` das Jelly von `player_id` betrifft und an die Oberfläche soll.
fn is_own_event(event: &ServerEvent, player_id: i64) -> bool {
    if [RULES_CHANGED, SCHEDULE_CHANGED, WIZARD_HAT_CHANGED].contains(&event.kind.as_str()) {
        return true;
    }
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
        let task = tauri::async_runtime::spawn(forward(app.clone(), source, api.clone(), me.id));
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
fn dispatch(app: &AppHandle, message: StreamMessage, player_id: i64, memory: &mut Memory) {
    match message {
        StreamMessage::Event(event) => {
            // Erst Stapel, News und Folgen: Sie müssen jedes Ereignis ihrer Art sehen, um sich den
            // Stand zu merken.
            let stacked = memory.own_stack.track(&event, player_id);
            let news = memory.news.track(&event);
            let followed = memory.follows.track(&event, player_id);
            if stacked || news || followed || is_own_event(&event, player_id) {
                emit_to_ui(app, EVENT_NAME, &event);
            }
            if popout::is_open(app, popout::MAP) {
                emit_to_ui(app, STAGE_EVENT_NAME, &event);
            }
            if closes_popouts(&event, player_id) {
                popout::close_all(app);
            }
        }
        StreamMessage::Move(walk) => {
            if popout::is_open(app, popout::MAP) {
                emit_to_ui(app, STAGE_MOVE_NAME, &walk);
            }
        }
        StreamMessage::Reset => emit_to_ui(app, STREAM_RESET_NAME, ()),
        StreamMessage::Other => {}
    }
}

/// Liest den Stream, bis der Server das Secret ablehnt.
async fn forward(app: AppHandle, mut source: EventSource, api: Api, player_id: i64) {
    let mut memory = Memory {
        follows: read_follows(&api).await,
        ..Memory::default()
    };
    while let Some(item) = source.next().await {
        match item {
            Ok(Event::Open) => {}
            Ok(Event::Message(message)) => {
                let parsed = parse_message(&message.event, &message.data);
                // Nach verworfenen Ereignissen stimmt nicht mehr, wer wem folgt.
                if matches!(parsed, StreamMessage::Reset) {
                    memory.follows = read_follows(&api).await;
                }
                dispatch(&app, parsed, player_id, &mut memory);
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
