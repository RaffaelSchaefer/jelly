/**
 * Der Klang des Zauberladens als ein Objekt je Fenster (`shopSound`): ein AudioContext für
 * Ambiente, Geräusche, Oberfläche und Stimmen. Er entsteht erst mit der ersten Geste und nie,
 * solange die Geräusche aus sind. Versteckt hält er an, ohne Fokus wird das Ambiente leiser, und
 * nach fünf Minuten ohne Eingabe schläft er ein. Die nächste Geste weckt ihn.
 *
 * `useShopSound` verbindet ihn mit dem Fenster. Was und wie es klingt, steht in `cues.ts`,
 * `ritual.ts` und `ambience.ts`.
 *
 * @module
 */

import type { AmbienceMood } from "../../pet/shopAmbience";
import type { LevelSpan } from "../../pet/shopMix";

import { SOUND_LIFECYCLE, SOURCE_LIMITS } from "../../pet/shopMix";
import {
  createShopRng,
  ritualScore,
  type RitualTimes,
  type ShopCue,
  type ShopRng,
  type ShopSfx,
} from "../../pet/shopScore";
import { volumeGain } from "../../pet/voice";
import { startAmbience, type Ambience } from "./ambience";
import {
  busOf,
  isDroppable,
  playCue,
  recipeOf,
  SFX_CUES,
  type CueName,
  type CueOptions,
} from "./cues";
import { createMixer, type ShopMixer } from "./mixer";
import { createStage, playRitual } from "./ritual";
import { prepareSynth } from "./synth";

export type { CueOptions } from "./cues";

/** Was der Klang aus den Einstellungen braucht. */
export interface ShopSoundSettings {
  sound: boolean;
  /** Lautstärke in Prozent. */
  volume: number;
  /** Schrumpft den Zauber beim Kauf auf seinen Einschlag. */
  reducedMotion: boolean;
}

/** Wohin eine Stimme singt: Kontext, Eingang an ihrem Platz und wer erfährt, wann sie spricht. */
export interface ShopVoiceRoute {
  context: AudioContext;
  output: AudioNode;
  /** Eine Phrase von `start` bis `end` (Kontext-Uhr): Das Ambiente duckt sich, die Kugel horcht. */
  onPhrase: (start: number, end: number) => void;
}

/** Vorlauf, damit nichts in der Vergangenheit beginnt. */
const LEAD = 0.01;

/** Takt und Weitblick des Planers fürs Ambiente. */
const TICK_MS = 200;
const HORIZON = 0.6;

/** Dasselbe Geräusch klingt nicht zweimal so kurz hintereinander, in Millisekunden. */
const MIN_REPEAT_MS = 30;
const REPEAT_MS: Partial<Record<CueName, number>> = { fizzle: 300 };

/**
 * Höchstens so viele Anproben klingen übereinander, etwa wenn die Pfeiltasten durch die Rolle
 * eilen. Zu teuer und schon im Besitz zählen mit.
 */
const MAX_TRY_ONS = 3;

/** Die Spielarten der Anprobe. */
const TRY_ONS: ReadonlySet<CueName> = new Set(["tryOn", "short", "owned"]);

/** Ein offener Kontext mit allem, was darin läuft. */
interface Session {
  context: AudioContext;
  mixer: ShopMixer;
  ambience: Ambience;
  rng: ShopRng;
  /** Wie viele kurze Quellen gerade klingen. */
  sources: number;
  /** Wie viele Anproben gerade klingen. */
  tryOns: number;
  /** Wie oft und wann ein Rezept zuletzt klang. */
  played: Map<CueName, { count: number; at: number }>;
  asleep: boolean;
  charge: { swell: LevelSpan; beat: LevelSpan } | null;
  tick?: number;
  suspend?: number;
  idle?: number;
}

/** Alles, was der Klang eines Fensters weiß. */
interface SoundState {
  settings: ShopSoundSettings;
  hidden: boolean;
  focused: boolean;
  mood: AmbienceMood;
  /** Wo zuletzt geklickt wurde, im Stereobild. */
  pointer: number;
  session: Session | null;
}

/** Plant das Ambiente voraus, solange der Kontext läuft. */
function startTicking(s: Session) {
  window.clearInterval(s.tick);
  const plan = () => s.ambience.scheduleUntil(s.context.currentTime + HORIZON);
  plan();
  s.tick = window.setInterval(plan, TICK_MS);
}

/** Hält den Kontext nach `ms` an, etwa versteckt oder eingeschlafen. */
function suspendAfter(s: Session, ms: number) {
  window.clearTimeout(s.suspend);
  s.suspend = window.setTimeout(() => {
    window.clearInterval(s.tick);
    void s.context.suspend().catch(() => null);
  }, ms);
}

/** Öffnet den Kontext: Mischer, Hall und ein Ambiente, das nach der ersten Geste einblendet. */
function open(state: SoundState): Session {
  const context = new AudioContext({ latencyHint: "interactive" });
  const mixer = createMixer(context, volumeGain(state.settings.volume));
  const at = context.currentTime + SOUND_LIFECYCLE.bedDelay;
  const seed = Date.now();
  const orb = mixer.place("orb", "ambience");
  const ambience = startAmbience(context, mixer.bus("ambience"), {
    orb,
    seed,
    at,
    mood: state.mood,
  });
  mixer.bedFade.ramp(1, at, at + SOUND_LIFECYCLE.bedRamp);
  mixer.bedFocus.set(state.focused ? 1 : SOUND_LIFECYCLE.blurLevel);
  // Die Münze erst nach der Geste rechnen: Der Klick soll nicht warten.
  window.setTimeout(() => prepareSynth(context), 0);
  const rng = createShopRng(seed ^ 0x5bd1e995);
  const s: Session = {
    context,
    mixer,
    ambience,
    rng,
    sources: 0,
    tryOns: 0,
    played: new Map(),
    asleep: false,
    charge: null,
  };
  startTicking(s);
  return s;
}

/** Schließt einen Kontext, auf Wunsch nach einem Ausblenden. */
function close(state: SoundState, s: Session, fade: number) {
  if (state.session === s) state.session = null;
  window.clearInterval(s.tick);
  window.clearTimeout(s.suspend);
  window.clearTimeout(s.idle);
  const shut = () => void s.context.close().catch(() => null);
  if (fade <= 0) return shut();
  s.mixer.master.glide(0, fade / 4);
  window.setTimeout(shut, fade * 1000);
}

/** Läuft wieder: Ton sofort, das Ambiente blendet langsam ein. */
function resume(s: Session) {
  window.clearTimeout(s.suspend);
  void s.context.resume().catch(() => null);
  s.mixer.master.glide(1, SOUND_LIFECYCLE.volumeTau);
  const now = s.context.currentTime;
  s.mixer.bedFade.set(0);
  s.mixer.bedFade.ramp(1, now, now + SOUND_LIFECYCLE.returnRamp);
  startTicking(s);
}

/** Nach langer Ruhe: Alles blendet aus, dann hält der Kontext an. */
function sleep(state: SoundState, s: Session) {
  if (s.asleep || state.session !== s) return;
  s.asleep = true;
  const now = s.context.currentTime;
  s.mixer.master.ramp(0, now, now + SOUND_LIFECYCLE.idleFade);
  suspendAfter(s, SOUND_LIFECYCLE.idleFade * 1000);
}

/** Jede Eingabe hält den Klang wach und weckt ihn, wenn er schlief. */
function touch(state: SoundState) {
  const s = state.session;
  if (!s) return;
  window.clearTimeout(s.idle);
  s.idle = window.setTimeout(() => sleep(state, s), SOUND_LIFECYCLE.idleSeconds * 1000);
  if (s.asleep && !state.hidden) {
    s.asleep = false;
    resume(s);
  }
}

/** Der Kontext, wenn gerade etwas klingen darf. */
function live(state: SoundState) {
  const s = state.session;
  return state.settings.sound && s && !s.asleep && !state.hidden ? s : null;
}

/**
 * Zählt die kurzen Quellen, solange sie klingen. Jede zählt für sich: Die lange Ladenglocke hält
 * sonst das ganze Ritual fest, und Zeiger und Anproben fänden keinen Platz mehr.
 */
function count(s: Session, sources: readonly AudioScheduledSourceNode[]) {
  s.sources += sources.length;
  for (const source of sources) source.addEventListener("ended", () => (s.sources -= 1));
}

/**
 * Ob noch Platz ist: Zeiger und Rascheln weichen zuerst, nichts klingt doppelt, und höchstens
 * {@link MAX_TRY_ONS} Anproben liegen übereinander.
 */
function roomFor(s: Session, name: CueName) {
  const limit = isDroppable(name) ? SOURCE_LIMITS.dropFirstAt : SOURCE_LIMITS.cap;
  const last = s.played.get(name)?.at ?? -Infinity;
  const repeat = REPEAT_MS[name] ?? MIN_REPEAT_MS;
  if (TRY_ONS.has(name) && s.tryOns >= MAX_TRY_ONS) return false;
  return s.sources < limit && performance.now() - last >= repeat;
}

/** Spielt ein Rezept. Fehler bleiben hier: Ton darf nie stören. */
function play(state: SoundState, name: CueName, options: CueOptions) {
  const s = live(state);
  if (!s || !roomFor(s, name)) return false;
  try {
    const turn = s.played.get(name)?.count ?? 0;
    s.played.set(name, { count: turn + 1, at: performance.now() });
    const at = s.context.currentTime + LEAD + (options.delayMs ?? 0) / 1000;
    const spec = { at, rng: s.rng, options, pointer: state.pointer, reverb: s.mixer.reverb };
    const tryOn = TRY_ONS.has(name) ? 1 : 0;
    const done = () => (s.tryOns -= tryOn);
    count(s, playCue(s.context, s.mixer.bus(busOf(name)), name, { ...spec, count: turn, done }));
    s.tryOns += tryOn;
    return true;
  } catch {
    return false;
  }
}

/** Das Kaufritual. Das Ambiente duckt sich, und die Kugel summt mit, während der Zauber sammelt. */
function purchase(state: SoundState, times: RitualTimes) {
  const s = live(state);
  if (!s) return false;
  try {
    const at = s.context.currentTime + LEAD;
    const score = ritualScore(times, s.rng, state.settings.reducedMotion);
    const stage = createStage(s.context, s.mixer.bus("sfx"));
    const sources = playRitual({ context: s.context, stage, at, rng: s.rng }, score);
    count(s, sources);
    stage.release(sources);
    s.mixer.duck(-3, score.end * 1000);
    if (!score.gather) return true;
    const { from, to } = score.gather;
    s.ambience.swell.add(8, at + from, at + to + 0.3);
    s.ambience.beat.add(3, at + from, at + to + 0.5);
    return true;
  } catch {
    return false;
  }
}

/** Solange das Siegel gehalten wird, summt die Kugel lauter und schwebt schneller. */
function charge(state: SoundState, on: boolean) {
  const s = on ? live(state) : state.session;
  if (!s || on === (s.charge !== null)) return;
  const now = s.context.currentTime;
  if (on) {
    s.charge = { swell: s.ambience.swell.add(6, now), beat: s.ambience.beat.add(1.5, now) };
    return;
  }
  if (s.charge) {
    s.ambience.swell.end(s.charge.swell, now);
    s.ambience.beat.end(s.charge.beat, now);
  }
  s.charge = null;
}

/** Wohin eine Stimme singt. `null`, solange nichts klingen darf. */
function voiceRoute(state: SoundState, place: "wizard" | "customer"): ShopVoiceRoute | null {
  const s = live(state);
  if (!s) return null;
  const output = s.mixer.place(place, place === "wizard" ? "voice" : "customer");
  const onPhrase = (start: number, end: number) => {
    if (!(end > start)) return;
    const now = s.context.currentTime;
    s.mixer.duck(-5, (end - start) * 1000, (start - now) * 1000);
    s.ambience.swell.add(3, start, end);
  };
  return { context: s.context, output, onPhrase };
}

/** Blendet aus und ruft dann `then`. Bleibt das Fenster doch offen, kommt der Ton zurück. */
function closeThen(state: SoundState, then: () => void) {
  const s = live(state);
  if (!s || s.context.state !== "running") return then();
  s.mixer.master.glide(0, SOUND_LIFECYCLE.closeFade / 4);
  window.setTimeout(then, SOUND_LIFECYCLE.closeFade * 1000);
  window.setTimeout(() => (live(state) === s ? resume(s) : undefined), 1000);
}

/** Ob dieses Fenster schon eine Geste gesehen hat. Ohne die Angabe (älteres WebKit) gilt: nein. */
function hadGesture() {
  return typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive === true;
}

/**
 * Übernimmt die Einstellungen. Geräusche aus schließt den Kontext nach kurzem Ausblenden. Wieder an
 * öffnet ihn gleich, wenn das Fenster schon eine Geste gesehen hat, sonst mit der nächsten.
 */
function configure(state: SoundState, next: ShopSoundSettings) {
  const wasOn = state.settings.sound;
  state.settings = { ...next };
  const s = state.session;
  if (!s) {
    if (!wasOn && next.sound && hadGesture()) arm(state);
    return;
  }
  if (wasOn && !next.sound) return close(state, s, SOUND_LIFECYCLE.offFade);
  s.mixer.volume.glide(volumeGain(next.volume), SOUND_LIFECYCLE.volumeTau);
}

/** Gibt den Ton frei: `resume()` sofort, ohne darauf zu warten. WebKit lässt es offen. */
function arm(state: SoundState) {
  if (!state.settings.sound) return;
  try {
    state.session ??= open(state);
    void state.session.context.resume().catch(() => null);
    touch(state);
  } catch {
    // Ohne WebAudio bleibt der Laden eben still.
    state.session = null;
  }
}

/** Versteckt blendet aus und hält bald an, sichtbar läuft es wieder. */
function setHidden(state: SoundState, hidden: boolean) {
  state.hidden = hidden;
  const s = state.session;
  if (!s) return;
  if (!hidden) return s.asleep ? undefined : resume(s);
  s.mixer.master.glide(0, SOUND_LIFECYCLE.hiddenTau);
  suspendAfter(s, SOUND_LIFECYCLE.hiddenSuspend * 1000);
}

/** Baut den Klang eines Fensters. Es gibt genau einen: {@link shopSound}. */
function createShopSound() {
  const state: SoundState = {
    settings: { sound: false, volume: 100, reducedMotion: false },
    hidden: false,
    focused: true,
    mood: "awake",
    pointer: 0,
    session: null,
  };
  return {
    /** Übernimmt Schalter, Lautstärke und reduzierte Bewegung. */
    configure: (next: ShopSoundSettings) => configure(state, next),
    /** Gibt den Ton frei, aus einem `pointerdown` oder `keydown` in der Capture-Phase heraus. */
    arm: () => arm(state),
    /** Eine Eingabe ohne Geste, etwa Mausrad oder Bewegung: hält wach und weckt. */
    touch: () => touch(state),
    /** Versteckt blendet aus und hält nach 0,8 s an, sichtbar läuft es wieder. */
    setHidden: (hidden: boolean) => setHidden(state, hidden),
    /** Ohne Fokus spielt das Ambiente leiser. */
    setFocused(focused: boolean) {
      state.focused = focused;
      const level = focused ? 1 : SOUND_LIFECYCLE.blurLevel;
      state.session?.mixer.bedFocus.glide(level, SOUND_LIFECYCLE.blurTau);
    },
    /** Merkt sich, wo zuletzt geklickt wurde, von −0,5 bis 0,5. Die Oberfläche klingt dort. */
    pointAt(pan: number) {
      state.pointer = pan;
    },
    /** Spielt ein Geräusch. `false`, wenn es nicht klingt: stumm, versteckt oder zu viel auf einmal. */
    cue: (name: ShopCue, options: CueOptions = {}) => play(state, recipeOf(name, options), options),
    /** Spielt das Kaufritual, Zeiten in Millisekunden ab jetzt, wie `purchaseTimeline` sie plant. */
    purchase: (times: RitualTimes) => purchase(state, times),
    /** Ein Geräusch des Zauberers, an ihm oder an seiner Kugel. */
    sfx(name: ShopSfx) {
      const s = live(state);
      const now = s?.context.currentTime ?? 0;
      if (name === "orbHum") s?.ambience.swell.add(6, now, now + 1.2);
      return play(state, SFX_CUES[name].cue, { place: SFX_CUES[name].place });
    },
    /** Solange das Siegel gehalten wird, summt die Kugel lauter und schwebt schneller. */
    charge: (on: boolean) => charge(state, on),
    /** Döst der Zauberer, wird das Ambiente leiser und das Knistern seltener. */
    setMood(mood: AmbienceMood) {
      state.mood = mood;
      state.session?.ambience.setMood(mood);
    },
    /** Wohin eine Stimme singt. `null`, solange nichts klingen darf. Je Phrase neu holen. */
    voiceRoute: (place: "wizard" | "customer") => voiceRoute(state, place),
    /** Blendet in 160 ms aus und ruft dann `then`, etwa bevor das Fenster zugeht. */
    closeThen: (then: () => void) => closeThen(state, then),
    /** Schließt den Kontext sofort. Die Einstellungen bleiben, eine neue Geste öffnet neu. */
    dispose() {
      if (state.session) close(state, state.session, 0);
    },
    /** Für die Hörprobe: der offene Kontext und wie viele kurze Quellen gerade klingen. */
    inspect() {
      const s = state.session;
      return { context: s?.context ?? null, sources: s?.sources ?? 0, asleep: s?.asleep ?? false };
    },
  };
}

/** Der Klang eines Shop-Fensters. */
export type ShopSound = ReturnType<typeof createShopSound>;

/** Der Klang des Shop-Fensters. Nichts sonst in diesem Fenster öffnet einen AudioContext. */
export const shopSound = createShopSound();
