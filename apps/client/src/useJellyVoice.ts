/**
 * Gibt dem Jelly seine Stimme: Was gerade erklingt und was der Mund dazu formt, folgt aus Meldung,
 * Hüpfer, Level und Geste.
 *
 * @module
 */

import { useEffect, useMemo, useRef } from "react";

import type { PetGame } from "./usePet";

import { pickClip, type VoiceMoment, type VoiceNote } from "./pet";
import { createVoice } from "./voice";

/** Eine Stimme für die ganze App. */
const voice = createVoice();

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

/** Eine Uhr ab jetzt, für einen Laut, den man nicht hört. */
function startClock() {
  const startedAt = performance.now();
  return () => (performance.now() - startedAt) / 1000;
}

/**
 * Spielt die Laute.
 *
 * @returns `saidAt` ist der Beginn der letzten Meldung auf der Uhr von `performance.now()`, für die
 *   Sprechblase. `voiced` hält, was der Mund gerade formt.
 */
export function useJellyVoice(game: PetGame) {
  const { message, messageId, pulse, activeEmote: emote, ready } = game;
  const { sound, volume: percent } = game.game.settings;
  const known = ready ? game.game.me : null;
  const level = known ? known.level : null;
  const volume = ready ? percent : null;

  useEffect(() => {
    const arm = () => voice.arm();
    for (const gesture of GESTURES) window.addEventListener(gesture, arm, true);
    return () => {
      for (const gesture of GESTURES) window.removeEventListener(gesture, arm, true);
    };
  }, []);

  const voiced = useRef<ActiveVoice | null>(null);
  const before = useRef<VoiceMoment>({ sound, message, messageId, pulse, level, volume, emote });
  // Ein Effekt für alles: Text, Hüpfer und Level kommen im selben Render und sollen nur einen Laut geben.
  useEffect(() => {
    const after: VoiceMoment = { sound, message, messageId, pulse, level, volume, emote };
    const clip = pickClip(before.current, after);
    // Auch stumm bewegt sich der Mund, so wie die Sprechblase weitertippt.
    const notes = clip ?? pickClip({ ...before.current, sound: true }, { ...after, sound: true });
    if (before.current.sound && !sound) voice.stop();
    before.current = after;
    voice.setVolume(percent);
    const clock = clip ? voice.play(clip) : null;
    if (notes?.length) {
      voiced.current = {
        notes: notes.filter((note) => !note.by),
        partnerNotes: notes.filter((note) => note.by),
        elapsed: clock ?? startClock(),
      };
    }
  }, [sound, message, messageId, pulse, level, volume, percent, emote]);

  // `messageId` zählt mit: Auch derselbe Satz wird neu gesprochen.
  const saidAt = useMemo(() => performance.now(), [message, messageId]);
  return { saidAt, voiced };
}
