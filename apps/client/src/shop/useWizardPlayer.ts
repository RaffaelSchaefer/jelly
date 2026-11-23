/**
 * Spielt die Skripte des Zauberers ab: Jeder Einsatz bekommt einen Zeitgeber relativ zum Beginn des
 * Skripts. Sätze gehen an Stimme und Sprechblase, Gesten, Blick und Stimmung in die Haltung, die
 * die Szene Bild für Bild liest, Geräusche und Effekte an ihre Hörer, die Kundschaft spielt mit.
 *
 * Seine eigenen Gesten gehen nur in die Haltung, geteilte wie das Zeigen auch als Emote. Er spricht
 * mit seiner alten Stimme (`pet/wizardVoice.ts`), seine Laute kommen aus `pet/wizardClips.ts`.
 *
 * Ein Effekt je Skript plant die Zeitgeber. Läuft er doppelt (StrictMode), plant er neu, statt
 * etwas zu verlieren oder zu verdoppeln. Einsätze, die schon mehr als 120 ms vorbei sind, wirken
 * still: Haltung und Blase ja, Ton und Effekte nicht. Was das nächste Skript unterbricht, verstummt
 * sofort, die Geste klingt in 0,3 s aus.
 *
 * @module
 */

import { EMOTE_SECONDS, isEmoteKey, type EmoteKey } from "@jelly/scene/emotes";
import { isWizardGestureKey } from "@jelly/scene/wizard-timing";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { ActiveEmote } from "../useEmotes";
import type { ActiveVoice } from "../useJellyVoice";

import { type VoiceNote } from "../pet/voice";
import { wizardClip } from "../pet/wizardClips";
import {
  flattenCues,
  GESTURE_SECONDS,
  RESTING_POSE,
  speechMs,
  type SayStyle,
  type WizardClipKey,
  type WizardCue,
  type WizardEffect,
  type WizardGesture,
  type WizardLook,
  type WizardPose,
  type WizardScript,
  type WizardSfx,
  type Priority,
} from "../pet/wizardScripts";
import { wizardTempo, wizardVoice } from "../pet/wizardVoice";
import { startClock } from "../voice";

/** Ein Satz mit Zähler: Auch derselbe Satz ist eine neue Meldung. */
export interface SaidLine {
  line: { text: string; doze?: true };
  id: number;
  /** Wann er ihn begann, auf der Uhr von `performance.now()`, für die Sprechblase. */
  at: number;
  /** Sprechtempo für die Blase, ohne Angabe 1. */
  tempo?: number;
  kind?: SayStyle;
  /** Wann die Blase verblasst, auf derselben Uhr. `null` lässt sie stehen. */
  until?: number | null;
  /** Ob Screenreader ihn vorlesen. */
  announce?: boolean;
}

/** Ein Effekt, den Bühne oder Oberfläche zeigen, mit Zähler und Zeitpunkt. */
export interface WizardEffectCue {
  id: number;
  effect: WizardEffect;
  itemId?: string;
  /** Auf der Uhr von `performance.now()`. */
  at: number;
}

/** Was die Kundschaft gerade tut: ihre Geste und wie oft sie schon gehüpft ist. */
export interface CustomerCue {
  emote: ActiveEmote | null;
  hops: number;
}

/** Die Stimme, wie `createVoice()` sie liefert. */
export interface WizardVoice {
  play(notes: VoiceNote[]): (() => number) | null;
  stop(): void;
}

/** Was der Spieler von außen braucht. */
export interface PlayerOptions {
  voice: WizardVoice;
  /** Ob gerade Ton erlaubt ist. */
  soundOn: () => boolean;
  /** Die Noten eines Lauts, ohne Angabe seine eigenen (`wizardClip`). */
  clipNotes?: (key: WizardClipKey) => VoiceNote[];
  onSfx?: (sound: WizardSfx) => void;
  onEffect?: (effect: WizardEffect, itemId?: string) => void;
}

/** So spät darf ein Einsatz noch hörbar kommen. */
const LATE_MS = 120;

/** So lange klingt eine unterbrochene Geste aus, in Sekunden. */
const FADE_SECONDS = 0.3;

/** So lange bleibt die Blase eines unterbrochenen Satzes noch stehen. */
const CUT_BUBBLE_MS = 600;

/** So viele Effekte merkt er sich. */
const EFFECT_MEMORY = 4;

/** Eine geteilte Geste ab `at`, `seconds` lang. */
function emoteAt(key: EmoteKey | null | undefined, at: number, seconds?: number) {
  const emote: ActiveEmote | null = key ? { key, label: "", startedAt: at, seconds } : null;
  return emote;
}

/** Eine Geste, die die Szene als geteiltes Emote spielt. Seine eigenen zeigt sie aus der Haltung. */
function sharedGesture(key: WizardGesture | null): EmoteKey | null {
  return key && !isWizardGestureKey(key) && isEmoteKey(key) ? key : null;
}

/** Was die Einsätze bewegen: Refs, Setzer und die Optionen. Bleibt über alle Bilder gleich. */
interface Hands {
  pose: RefObject<WizardPose>;
  voiced: RefObject<ActiveVoice | null>;
  options: RefObject<PlayerOptions>;
  counter: RefObject<number>;
  bump: () => void;
  setSaid: (update: (said: SaidLine | null) => SaidLine | null) => void;
  setEmote: (emote: ActiveEmote | null) => void;
  setDozing: (dozing: boolean) => void;
  setPulse: (update: (pulse: number) => number) => void;
  setEffects: (update: (effects: WizardEffectCue[]) => WizardEffectCue[]) => void;
  setCustomer: (update: (customer: CustomerCue) => CustomerCue) => void;
}

/** Wann ein Einsatz gilt und ob er still wirkt. `later` plant etwas nach ihm. */
interface CueTime {
  at: number;
  late: boolean;
  startedAt: number;
  /** Rang des Skripts: Beiläufiges spricht er leiser. */
  priority: Priority;
  later: (run: () => void, ms: number) => void;
}

/** Wie ein Einsatz der Art `K` wirkt. */
type CueHandler<K extends WizardCue["kind"]> = (
  hands: Hands,
  cue: Extract<WizardCue, { kind: K }>,
  time: CueTime,
) => void;

/** Lässt Noten erklingen und den Mund mitgehen, auch stumm. */
function voice(hands: Hands, notes: VoiceNote[], time: CueTime) {
  const { voice: output, soundOn } = hands.options.current;
  const clock = !time.late && soundOn() && notes.length > 0 ? output.play(notes) : null;
  hands.voiced.current = { notes, partnerNotes: [], elapsed: clock ?? startClock() };
}

/** Ein Satz: Stimme, Mund und Blase. Das Schnarchen zeigt nur die Blase, sein Laut kommt extra. */
const sayCue: CueHandler<"say"> = (hands, cue, time) => {
  const snore = cue.style === "snore";
  const tempo = wizardTempo(cue.style);
  if (!snore) voice(hands, wizardVoice(cue.text, cue.style, time.priority), time);
  const pose = hands.pose.current;
  pose.speaking = !snore;
  hands.bump();
  time.later(
    () => {
      pose.speaking = false;
      hands.bump();
    },
    time.at + speechMs(cue.text, tempo) - performance.now(),
  );
  hands.counter.current += 1;
  const said: SaidLine = {
    line: snore ? { text: cue.text, doze: true } : { text: cue.text },
    id: hands.counter.current,
    at: time.at,
    tempo,
    kind: cue.style,
    until: cue.untilMs === null ? null : time.at + cue.untilMs,
    announce: cue.announce,
  };
  hands.setSaid(() => said);
};

/** Eine Geste. Mit `keep` läuft dieselbe weiter und bekommt nur neue Zeiten. */
const gestureCue: CueHandler<"gesture"> = (hands, cue, time) => {
  const pose = hands.pose.current;
  const running = pose.gesture;
  const key = cue.gesture;
  const startedAt = cue.keep && running?.key === key ? running.startedAt : time.at;
  const seconds = cue.seconds ?? (key ? GESTURE_SECONDS[key] : 0);
  const release = cue.releaseMs === undefined ? undefined : time.startedAt + cue.releaseMs;
  pose.gesture = key && {
    key,
    startedAt,
    seconds: (time.at - startedAt) / 1000 + seconds,
    ...(release === undefined ? {} : { releaseAt: (release - startedAt) / 1000 }),
  };
  if (startedAt === time.at) hands.setEmote(emoteAt(sharedGesture(key), time.at, seconds));
  hands.bump();
};

/**
 * Ein Blick, eine Stimmung oder der Hut. Wer einschläft, schläft ab jetzt im Takt seines Atems. Der
 * Hut geht oder kommt ab jetzt, wie lange das dauert, weiß die Szene.
 */
function lookAt(hands: Hands, look: WizardLook, at: number) {
  const pose = hands.pose.current;
  if (look.gaze) pose.gaze = look.gaze;
  if (look.hatOff !== undefined) pose.hat = { off: look.hatOff, at };
  if (look.mood) {
    if (look.mood !== "asleep") pose.asleepSince = null;
    else if (pose.mood !== "asleep") pose.asleepSince = at;
    pose.mood = look.mood;
    hands.setDozing(look.mood === "asleep");
  }
  hands.bump();
}

/** Was jeder Einsatz bewirkt. */
const CUES: { [K in WizardCue["kind"]]: CueHandler<K> } = {
  say: sayCue,
  gesture: gestureCue,
  clip: (hands, cue, time) => {
    const notes = (hands.options.current.clipNotes ?? wizardClip)(cue.clip);
    if (notes.length > 0) voice(hands, notes, time);
  },
  gaze: (hands, cue, time) => lookAt(hands, { gaze: cue.target }, time.at),
  mood: (hands, cue, time) => lookAt(hands, { mood: cue.mood }, time.at),
  sfx: (hands, cue, time) => {
    if (!time.late) hands.options.current.onSfx?.(cue.sound);
  },
  effect: (hands, cue, time) => {
    if (time.late) return;
    hands.options.current.onEffect?.(cue.effect, cue.itemId);
    hands.counter.current += 1;
    const shown = {
      id: hands.counter.current,
      effect: cue.effect,
      itemId: cue.itemId,
      at: time.at,
    };
    hands.setEffects((effects) => [...effects, shown].slice(-EFFECT_MEMORY));
    if (cue.effect === "spellBurst") hands.setPulse((pulse) => pulse + 1);
  },
  customer: (hands, cue, time) => {
    const hop = cue.hop && !time.late ? 1 : 0;
    const emote = emoteAt(cue.emote, time.at, cue.seconds);
    hands.setCustomer((customer) => ({ emote, hops: customer.hops + hop }));
  },
};

/** Wendet einen Einsatz an. */
function applyCue(hands: Hands, cue: WizardCue, time: CueTime) {
  (CUES[cue.kind] as CueHandler<WizardCue["kind"]>)(hands, cue, time);
}

/** Ein Skript und wann es begann, auf der Uhr von `performance.now()`. */
interface Playing {
  script: WizardScript;
  startedAt: number;
}

/** Plant die Einsätze des laufenden Skripts. Die Aufräumfunktion löscht alle Zeitgeber. */
function useCueTimers(hands: Hands, playing: Playing | null) {
  useEffect(() => {
    if (!playing) return;
    const timers: number[] = [];
    const later = (run: () => void, ms: number) => {
      timers.push(window.setTimeout(run, Math.max(0, ms)));
    };
    const { script, startedAt } = playing;
    const now = performance.now();
    for (const cue of flattenCues(script.cues)) {
      const at = startedAt + cue.at;
      const late = at - now < -LATE_MS;
      const time = { at, late, startedAt, priority: script.priority, later };
      if (late) applyCue(hands, cue, time);
      else later(() => applyCue(hands, cue, time), at - now);
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [hands, playing]);
}

/** Nimmt eine Geste nach ihrer Dauer wieder weg, sonst stünde sie still in der letzten Pose. */
function useExpiring(emote: ActiveEmote | null | undefined, clear: () => void) {
  useEffect(() => {
    if (!emote) return;
    const left = emote.startedAt + (emote.seconds ?? EMOTE_SECONDS) * 1000 - performance.now();
    const timer = window.setTimeout(clear, Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [emote, clear]);
}

/** Ein unterbrochenes Skript: Stimme aus, Geste klingt aus, die Blase verblasst bald. */
function cut(hands: Hands, now: number) {
  hands.options.current.voice.stop();
  const pose = hands.pose.current;
  const gesture = pose.gesture;
  if (gesture) {
    const elapsed = (now - gesture.startedAt) / 1000;
    pose.gesture = { ...gesture, seconds: Math.min(gesture.seconds, elapsed + FADE_SECONDS) };
  }
  pose.speaking = false;
  hands.bump();
  const fade = now + CUT_BUBBLE_MS;
  hands.setSaid((said) =>
    said && typeof said.until === "number" && said.until > fade ? { ...said, until: fade } : said,
  );
}

/** Der Stand, den der Spieler zeigt. */
function usePlayerState() {
  const [said, setSaid] = useState<SaidLine | null>(null);
  const [emote, setEmote] = useState<ActiveEmote | null>(null);
  const [dozing, setDozing] = useState(false);
  const [poseVersion, setPoseVersion] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [effects, setEffects] = useState<WizardEffectCue[]>([]);
  const [customer, setCustomer] = useState<CustomerCue>({ emote: null, hops: 0 });
  const setters = { setSaid, setEmote, setDozing, setPulse, setEffects, setCustomer };
  const bump = () => setPoseVersion((version) => version + 1);
  const shown = { said, emote, dozing, poseVersion, pulse, effects, customer };
  return { shown, setters, bump };
}

/**
 * Der Spieler. `play` beginnt ein Skript ab `startedAt`, `look` setzt Blick oder Stimmung ohne
 * Skript. Beide sind stabil.
 */
export function useWizardPlayer(options: PlayerOptions) {
  const { shown, setters, bump } = usePlayerState();
  const pose = useRef<WizardPose>({ ...RESTING_POSE });
  const voiced = useRef<ActiveVoice | null>(null);
  const latest = useRef(options);
  const counter = useRef(0);
  const [playing, setPlaying] = useState<Playing | null>(null);
  useEffect(() => {
    latest.current = options;
  });
  // Setzer von React sind stabil, so bleibt `hands` über alle Bilder dasselbe.
  const [hands] = useState<Hands>(() => ({
    pose,
    voiced,
    options: latest,
    counter,
    bump,
    ...setters,
  }));
  useCueTimers(hands, playing);
  const [clear] = useState(() => ({
    emote: () => hands.setEmote(null),
    customer: () => hands.setCustomer((customer) => ({ ...customer, emote: null })),
  }));
  useExpiring(shown.emote, clear.emote);
  useExpiring(shown.customer.emote, clear.customer);
  const controls = useMemo(
    () => ({
      play(script: WizardScript, interrupt: boolean, startedAt: number) {
        if (interrupt) cut(hands, startedAt);
        setPlaying({ script, startedAt });
      },
      look: (look: WizardLook) => lookAt(hands, look, performance.now()),
    }),
    [hands],
  );
  return { ...shown, pose, voiced, ...controls };
}

/** Was {@link useWizardPlayer} liefert. */
export type WizardPlayer = ReturnType<typeof useWizardPlayer>;
