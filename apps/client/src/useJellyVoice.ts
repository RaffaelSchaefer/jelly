/**
 * Gibt dem Jelly seine Stimme: Was gerade erklingt und was der Mund dazu formt, folgt aus Meldung,
 * Hüpfer, Level und Geste. Dazu spricht hier der Vorleser der Jelly-News seine Sätze.
 *
 * Liest ein anderes Jelly vor, spricht es mit eigener Stimme ({@link moderator}), und der Mund des
 * eigenen Jellys bleibt still. Liest das eigene vor, spricht es selbst, mit Mund. In beiden Fällen
 * gehen die eigenen Sätze vor: Kommt einer, verstummt der Vorleser, und spricht das Jelly gerade,
 * setzt er für diesen Beitrag aus (`pickAnchor`).
 *
 * @module
 */

import { useEffect, useMemo, useRef } from "react";

import type { PetGame } from "./usePet";

import {
  notesSeconds,
  pickAnchor,
  pickClip,
  type AnchorLine,
  type VoiceMoment,
  type VoiceNote,
} from "./pet";
import { createVoice, startClock } from "./voice";

/** Eine Stimme für die ganze App. */
const voice = createVoice();

/**
 * Die Stimme eines fremden Vorlesers der Jelly-News, mit der Klangfarbe je Satz. Ein eigenes
 * Audiogerät: So löst sie das Jelly nicht ab, und das Jelly sie nur, wenn es selbst spricht.
 */
const moderator = createVoice();

/** Bis wann das eigene Jelly spricht, auf der Uhr von `performance.now()`. */
let ownUntil = 0;

/** Was als Geste des Nutzers zählt. */
const GESTURES = ["pointerdown", "keydown"] as const;

/**
 * Was das Jelly gerade formt. Liegt in einem Ref: Der Mund liest es jedes Bild, ohne neu zu
 * rendern.
 */
export interface ActiveVoice {
  /** Was das eigene Jelly singt. */
  notes: VoiceNote[];
  /** Was der Partner eines Partner-Emotes singt. */
  partnerNotes: VoiceNote[];
  /** Sekunden seit dem Anfang des Lauts. */
  elapsed: () => number;
}

/** Wo der Mund liest, was das Jelly formt. */
type Voiced = { current: ActiveVoice | null };

/**
 * Spielt, was das Jelly selbst sagt, und zeigt es dem Mund. Ein eigener Satz lässt den Vorleser
 * verstummen.
 */
function speakOwn(before: VoiceMoment, after: VoiceMoment, voiced: Voiced) {
  const clip = pickClip(before, after);
  // Auch stumm bewegt sich der Mund, so wie die Sprechblase weitertippt.
  const notes = clip ?? pickClip({ ...before, sound: true }, { ...after, sound: true });
  const clock = clip ? voice.play(clip) : null;
  if (clip?.length) {
    moderator.stop();
    ownUntil = performance.now() + notesSeconds(clip) * 1000;
  }
  if (notes?.length) {
    voiced.current = {
      notes: notes.filter((note) => !note.by),
      partnerNotes: notes.filter((note) => note.by),
      elapsed: clock ?? startClock(),
    };
  }
}

/**
 * Spielt die Sätze des Vorlesers. Nach dem Effekt der eigenen Laute aufgerufen: Spricht das Jelly
 * im selben Moment, weiß das {@link ownUntil} schon.
 */
function useAnchorVoice(line: AnchorLine | null, sound: boolean, voiced: Voiced) {
  const before = useRef<AnchorLine | null>(line);
  useEffect(() => {
    const anchor = pickAnchor(before.current, line, sound, performance.now() < ownUntil);
    before.current = line;
    if (!anchor) return;
    if (!anchor.own) {
      moderator.play(anchor.notes, anchor.timbre);
      return;
    }
    const clock = voice.play(anchor.notes);
    voiced.current = { notes: anchor.notes, partnerNotes: [], elapsed: clock ?? startClock() };
  }, [line, sound, voiced]);
}

/**
 * Spielt die Laute.
 *
 * @returns `saidAt` ist der Beginn der letzten Meldung auf der Uhr von `performance.now()`, für die
 *   Sprechblase. `voiced` hält, was der Mund gerade formt.
 */
export function useJellyVoice(game: PetGame) {
  const { message, messageId, pulse, touched, activeEmote: emote, ready, newsJingle: news } = game;
  const { sound, volume: percent } = game.game.settings;
  const known = ready ? game.game.me : null;
  const level = known ? known.level : null;
  const volume = ready ? percent : null;

  useEffect(() => {
    const arm = () => {
      voice.arm();
      moderator.arm();
    };
    for (const gesture of GESTURES) window.addEventListener(gesture, arm, true);
    return () => {
      for (const gesture of GESTURES) window.removeEventListener(gesture, arm, true);
    };
  }, []);

  const voiced = useRef<ActiveVoice | null>(null);
  const moment: VoiceMoment = {
    sound,
    message,
    messageId,
    pulse,
    level,
    volume,
    emote,
    touched,
    news,
  };
  const before = useRef(moment);
  // Ein Effekt für alles: Text, Hüpfer, Level und Jingle kommen im selben Render und sollen nur
  // einen Laut geben.
  useEffect(() => {
    if (before.current.sound && !moment.sound) {
      voice.stop();
      moderator.stop();
    }
    voice.setVolume(percent);
    moderator.setVolume(percent);
    speakOwn(before.current, moment, voiced);
    before.current = moment;
    // `moment` ist je Render neu, es zählen seine Felder.
  }, [sound, message, messageId, pulse, level, volume, percent, emote, touched, news]);
  useAnchorVoice(game.newsAnchor, sound, voiced);

  // `messageId` zählt mit: Auch derselbe Satz wird neu gesprochen.
  const saidAt = useMemo(() => performance.now(), [message, messageId]);
  return { saidAt, voiced };
}
