/**
 * Lässt den Zauberer leben: Er sagt etwas, macht eine Geste dazu, spricht mit eigener, tieferer
 * Stimme und nickt ein, wenn eine Weile niemand etwas tut. Was er sagt, rechnet `pet/wizard.ts`.
 *
 * @module
 */

import { EMOTE_SECONDS } from "@jelly/scene/emotes";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ActiveEmote } from "../useEmotes";
import type { ActiveVoice } from "../useJellyVoice";

import { wizardLine, wizardNotes, type Settings, type WizardLine, type WizardMoment } from "../pet";
import { createVoice, startClock } from "../voice";

/** Seine Stimme. Das Shop-Fenster hat seine eigene, unabhängig von der des Pets. */
const voice = createVoice();

/** Was als Geste des Nutzers zählt: Sie macht den Ton frei und hält ihn wach. */
const GESTURES = ["pointerdown", "keydown"] as const;

/** So lange ohne Eingabe, bis er einnickt. */
const DOZE_AFTER_MS = 45_000;

/**
 * So lange wartet er nach dem Aufwecken mit seinem Satz. Ein Klick auf ein Teil geht vor: Dann
 * spricht er nur darüber.
 */
const WAKE_DELAY_MS = 350;

/** Ein Satz mit Zähler: Auch derselbe Satz ist eine neue Meldung. */
export interface SaidLine {
  line: WizardLine;
  id: number;
  /** Wann er ihn begann, auf der Uhr von `performance.now()`, für die Sprechblase. */
  at: number;
}

/** Die Geste zu einem Satz, ab jetzt. */
function gestureOf(line: WizardLine): ActiveEmote | null {
  return line.gesture ? { key: line.gesture, label: "", startedAt: performance.now() } : null;
}

/** Folgt Ton-Schalter und Lautstärke. Die erste Geste macht den Ton frei. */
function useVoiceSettings({ sound, volume }: Settings) {
  const soundOn = useRef(sound);
  useEffect(() => {
    soundOn.current = sound;
    voice.setVolume(volume);
    if (!sound) voice.stop();
  }, [sound, volume]);
  useEffect(() => {
    const arm = () => voice.arm();
    for (const gesture of GESTURES) window.addEventListener(gesture, arm, true);
    return () => {
      for (const gesture of GESTURES) window.removeEventListener(gesture, arm, true);
    };
  }, []);
  return soundOn;
}

/** Nimmt eine Geste nach ihrer Dauer wieder weg, sonst stünde sie still in der letzten Pose. */
function useGestureEnd(emote: ActiveEmote | null, clear: () => void) {
  useEffect(() => {
    if (!emote) return;
    const timer = window.setTimeout(clear, EMOTE_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [emote, clear]);
}

/**
 * Nach {@link DOZE_AFTER_MS} ohne Eingabe nickt er ein, die nächste Geste weckt ihn.
 *
 * @param say - Sollte stabil sein.
 */
function useDozing(dozing: boolean, say: (moment: WizardMoment) => void, wake: () => void) {
  useEffect(() => {
    let timer = window.setTimeout(() => say({ kind: "doze" }), DOZE_AFTER_MS);
    function stir() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => say({ kind: "doze" }), DOZE_AFTER_MS);
      if (dozing) wake();
    }
    for (const gesture of GESTURES) window.addEventListener(gesture, stir, true);
    return () => {
      window.clearTimeout(timer);
      for (const gesture of GESTURES) window.removeEventListener(gesture, stir, true);
    };
  }, [dozing, say, wake]);
}

/**
 * Der Zauberer: was er zuletzt sagte, seine Geste, ob er döst, und was sein Mund formt.
 *
 * @returns `say` lässt ihn zu einem Anlass sprechen und ist stabil.
 */
export function useWizard(settings: Settings) {
  const [said, setSaid] = useState<SaidLine | null>(null);
  const [emote, setEmote] = useState<ActiveEmote | null>(null);
  const voiced = useRef<ActiveVoice | null>(null);
  const turn = useRef(0);
  const waking = useRef<number | undefined>(undefined);
  const soundOn = useVoiceSettings(settings);

  const say = useCallback(
    (moment: WizardMoment) => {
      window.clearTimeout(waking.current);
      const line = wizardLine(moment, turn.current);
      turn.current += 1;
      const notes = wizardNotes(line);
      const clock = soundOn.current ? voice.play(notes) : null;
      // Auch stumm bewegt sich der Mund, so wie die Sprechblase weitertippt.
      voiced.current = { notes, partnerNotes: [], elapsed: clock ?? startClock() };
      setSaid({ line, id: turn.current, at: performance.now() });
      setEmote(gestureOf(line));
    },
    [soundOn],
  );

  const wake = useCallback(() => {
    // Wach ist er sofort, der Satz dazu darf einem Klick auf ein Teil weichen.
    setSaid((last) => last && { ...last, line: { ...last.line, doze: undefined } });
    waking.current = window.setTimeout(() => say({ kind: "wake" }), WAKE_DELAY_MS);
  }, [say]);

  const clearEmote = useCallback(() => setEmote(null), []);
  useGestureEnd(emote, clearEmote);
  const dozing = said?.line.doze === true;
  useDozing(dozing, say, wake);
  useEffect(() => () => window.clearTimeout(waking.current), []);

  return { said, emote, dozing, voiced, say };
}

/** Alles, was {@link useWizard} liefert. */
export type WizardControls = ReturnType<typeof useWizard>;
