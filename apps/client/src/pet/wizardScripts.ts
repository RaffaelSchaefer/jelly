/**
 * Die Sprache der Auftritte des Zauberers: Ein Skript ist eine Folge von Einsätzen (Satz, Laut,
 * Geste, Blick, Stimmung, Geräusch, Effekt, Kundschaft) mit Zeiten in Millisekunden ab seinem
 * Beginn. So laufen Stimme, Hände, Augen, Licht und Klang nach einer Uhr.
 *
 * Hier stehen die Typen (was die Oberfläche ihm meldet, was er weiß, wie ein Skript aussieht), die
 * Zeitrechnung und kleine Bausteine für Skripte. Was er in welchem Moment tut, steht in
 * `wizard.ts`, wann er es tut, in `wizardBrain.ts` und `wizardIdle.ts`. Abgespielt wird es in
 * `shop/useWizardPlayer.ts`.
 *
 * @module
 */

import type { EmoteKey } from "@jelly/scene/emotes";

import type { ShopItem } from "./shop";
import type { PurchaseTimeline } from "./shopTimeline";
import type { ServerEvent } from "./types";
import type { LineSlots, LineTopic } from "./wizardLines";

import { speechNotes, speechSyllables } from "./voice";

/**
 * Dauer seiner Gesten in Sekunden: die eigenen wie `WIZARD_GESTURE_SECONDS` in
 * `@jelly/scene/wizard-timing`, dazu das geteilte Zeigen. Das Schnarchen kreist, bis etwas anderes
 * kommt.
 */
export const GESTURE_SECONDS = {
  hail: 2,
  rejoice: 2,
  shrug: 2.2,
  offer: 2,
  tip: 1.8,
  cast: 3.4,
  count: 2.8,
  stroke: 3.6,
  nod: 1.2,
  yawn: 2.4,
  startle: 0.7,
  snore: 4.2,
  peek: 1.2,
  chuckle: 1.6,
  huff: 1.8,
  point: 1.6,
} as const;

/** Eine seiner Gesten. */
export type WizardGesture = keyof typeof GESTURE_SECONDS;

/** Alle seine Gesten. */
export const WIZARD_GESTURES = Object.keys(GESTURE_SECONDS) as readonly WizardGesture[];

/** Ungefähre Länge seiner Laute in Millisekunden. Die Noten stehen in der App. */
export const CLIP_MS = {
  hmm: 600,
  hoho: 600,
  yawn: 2000,
  snore: 4200,
  mumble: 700,
  hum: 3400,
  oh: 200,
};

/** Einer seiner Laute ohne Worte. */
export type WizardClipKey = keyof typeof CLIP_MS;

/** Alle seine Laute ohne Worte. */
export const WIZARD_CLIPS = Object.keys(CLIP_MS) as readonly WizardClipKey[];

/** Sein Sprechtempo: etwas langsamer als das Jelly. */
export const WIZARD_TEMPO = 0.9;

/** Wohin er schaut. */
export type GazeTarget = "viewer" | "customer" | "orb" | "purse" | "ledger" | "seal";

/** Seine Stimmung, sie färbt Lider, Brauen und Mund. */
export type WizardMood =
  | "neutral"
  | "attentive"
  | "focused"
  | "delighted"
  | "drowsy"
  | "asleep"
  | "startled"
  | "sheepish";

/** Ein Effekt, den Bühne oder Oberfläche zeigen. */
export type WizardEffect =
  | "spellBurst"
  | "fizzle"
  | "orbGlint"
  | "hatSparkle"
  | "highlightItem"
  | "purseClink";

/** Ein Geräusch zu seinen Bewegungen. */
export type WizardSfx =
  | "orbHum"
  | "spellBurst"
  | "whoosh"
  | "impact"
  | "fizzle"
  | "coinClink"
  | "pageTurn"
  | "hatTip"
  | "glint"
  | "snort";

/** Wie er etwas sagt. Die Sprechblase zeigt es mit `data-kind`. */
export type SayStyle = "speech" | "thought" | "incantation" | "snore";

/** Wie wichtig ein Skript ist: 0 Zauber, 1 Handlung, 2 Server und Stupser, 3 Beiläufiges. */
export type Priority = 0 | 1 | 2 | 3;

/** Ein Satz. `untilMs` zählt ab dem Satz, `null` lässt die Blase stehen. */
export interface SayCue {
  at: number;
  kind: "say";
  text: string;
  style: SayStyle;
  /** Ob Screenreader ihn vorlesen. */
  announce: boolean;
  untilMs: number | null;
}

/** Ein Laut. Mit `everyMs` wiederholt er sich, bis `untilMs` nach seinem Einsatz. */
export interface ClipCue {
  at: number;
  kind: "clip";
  clip: WizardClipKey;
  everyMs?: number;
  untilMs?: number;
}

/**
 * Eine Geste ab `at` für `seconds`. `releaseMs` (ab Skriptbeginn) löst einen Zauber aus. Mit `keep`
 * läuft dieselbe Geste weiter, statt neu zu beginnen. `null` lässt die Hände ruhen.
 */
export interface GestureCue {
  at: number;
  kind: "gesture";
  gesture: WizardGesture | null;
  seconds?: number;
  releaseMs?: number;
  keep?: true;
}

/** Was die Kundschaft tut: eine Geste für höchstens 2 s und vielleicht ein Hüpfer. */
export interface CustomerStep {
  at: number;
  kind: "customer";
  emote: EmoteKey | null;
  seconds: number;
  hop?: true;
}

/** Ein Einsatz im Skript. */
export type WizardCue =
  | SayCue
  | ClipCue
  | GestureCue
  | CustomerStep
  | { at: number; kind: "gaze"; target: GazeTarget }
  | { at: number; kind: "mood"; mood: WizardMood }
  | { at: number; kind: "sfx"; sound: WizardSfx }
  | { at: number; kind: "effect"; effect: WizardEffect; itemId?: string };

/** Ein Auftritt. */
export interface WizardScript {
  id: number;
  /** Wozu er gehört, etwa `select` oder `poke`. */
  topic: string;
  priority: Priority;
  /** Nach `at` sortiert. */
  cues: WizardCue[];
  /** So lange hält er sein Wort: Bis dahin unterbricht nur Gleich- oder Höherrangiges. */
  holdMs: number;
  /** Bis dahin unterbricht ihn gar nichts, etwa den Zauber bis zu den Glückwünschen. */
  lockMs: number;
  /** Fällt ihm nicht ins Wort, auch nicht bei gleichem Rang, sondern wartet. */
  polite: boolean;
}

/** Ein Skript, bevor das Gehirn ihm eine Nummer gibt. */
export type ScriptDraft = Omit<WizardScript, "id">;

/**
 * Seine Haltung, Bild für Bild gelesen. `startedAt` auf der Uhr von `performance.now()`, `seconds`
 * und `releaseAt` in Sekunden ab `startedAt`.
 */
export interface WizardPose {
  gesture: { key: WizardGesture; startedAt: number; seconds: number; releaseAt?: number } | null;
  mood: WizardMood;
  gaze: GazeTarget;
  /** Seit wann er schläft, auf der Uhr von `performance.now()`. Takt des Schnarchens. */
  asleepSince: number | null;
  speaking: boolean;
}

/** Wach, ruhig, mit Blick nach vorn. */
export const RESTING_POSE: WizardPose = {
  gesture: null,
  mood: "neutral",
  gaze: "viewer",
  asleepSince: null,
  speaking: false,
};

/** Was er über Laden und Kundschaft weiß. `null` heißt unbekannt. */
export interface WizardContext {
  name: string | null;
  coins: number | null;
  /** Münzen je Level-Aufstieg. */
  perLevel: number | null;
  xp: number | null;
  xpPerLevel: number | null;
  /** Ob eine LAN läuft und der Laden verkauft. */
  open: boolean | null;
  items: readonly ShopItem[] | null;
  /** Was das Jelly gerade trägt, als Schlüssel. */
  worn: readonly string[] | null;
  /** Ob es schon einmal gekauft hat. */
  regular: boolean | null;
  /** Ortszeit in Stunden. */
  hour: number | null;
  /** Reduzierte Bewegung: kein Leerlauf. */
  calm: boolean;
  /** Teile mit 3D-Modell. */
  modelKeys: readonly string[] | null;
}

/** Noch nichts bekannt. */
export const UNKNOWN_CONTEXT: WizardContext = {
  name: null,
  coins: null,
  perLevel: null,
  xp: null,
  xpPerLevel: null,
  open: null,
  items: null,
  worn: null,
  regular: null,
  hour: null,
  calm: false,
  modelKeys: null,
};

/** Was ein Skript beim Bauen braucht: Wissen, Sätze ohne Wiederholung und Zufall mit Startwert. */
export interface ScriptKit {
  ctx: WizardContext;
  /** Ein Satz zu `topic`, nicht wiederholt. */
  line(topic: LineTopic, slots?: LineSlots): string;
  /** Die Fassung an Stelle `index`, für Leitern wie das Stupsen. */
  lineAt(topic: LineTopic, index: number, slots?: LineSlots): string;
  /** Ob ein Ereignis mit Wahrscheinlichkeit `p` eintritt. */
  chance(p: number): boolean;
  /** Eine Zufallszahl von 0 bis unter 1. */
  random(): number;
}

/** Ein Hinweis der Oberfläche oder vom Server an den Zauberer. */
export type WizardNotice =
  | { kind: "hover"; target: "item" | "seal" | "purse"; itemId?: string }
  | { kind: "unhover" }
  | { kind: "select"; item: ShopItem }
  | { kind: "hold"; item: ShopItem }
  | { kind: "release" }
  | { kind: "commit"; item: ShopItem }
  | { kind: "bought"; item: ShopItem; timeline: PurchaseTimeline }
  | { kind: "buyFailed"; item: ShopItem }
  | { kind: "blocked"; item?: ShopItem; itemId?: string }
  | { kind: "equipped"; item: ShopItem; worn: boolean }
  | { kind: "poke" }
  | { kind: "server"; event: ServerEvent };

/** Alles, worauf sein Gehirn reagiert. `input` ist eine Eingabe, `strong` ein Klick oder eine Taste. */
export type WizardEvent =
  | WizardNotice
  | { kind: "ready" }
  | { kind: "context"; patch: Partial<WizardContext> }
  | { kind: "input"; strong: boolean }
  | { kind: "tick" }
  | { kind: "hidden" }
  | { kind: "visible" };

/** Ein Blick oder eine Stimmung ohne Skript, etwa zur Ware unter dem Zeiger. */
export interface WizardLook {
  gaze?: GazeTarget;
  mood?: WizardMood;
}

/** Tempo je Sprechweise. */
const STYLE_TEMPO: Readonly<Record<SayStyle, number>> = {
  speech: WIZARD_TEMPO,
  thought: 1.05,
  incantation: 0.85,
  snore: 1,
};

/** Pause zwischen zwei Sätzen eines Skripts. */
export const BEAT_GAP_MS = 600;

/** Sprechdauer von `text` in Millisekunden. */
export function speechMs(text: string, tempo = WIZARD_TEMPO) {
  const last = speechNotes(text).at(-1);
  return last ? ((last.at + last.duration) / tempo) * 1000 : 0;
}

/**
 * Wann die Silbe gesungen wird, in der das Zeichen `charOffset` steht, in Millisekunden ab dem
 * Satz. So landet eine Geste auf einem Wort.
 */
export function cueAtSlot(text: string, charOffset: number, tempo = WIZARD_TEMPO) {
  let end = 0;
  const syllables = speechSyllables(text);
  for (const syllable of syllables) {
    end += syllable.text.length;
    if (charOffset < end) return (syllable.at / tempo) * 1000;
  }
  return ((syllables.at(-1)?.at ?? 0) / tempo) * 1000;
}

/** So lange steht die Blase nach dem Satz noch da: mit dem Text länger, 2,6 bis 5,2 s. */
export function lingerMs(text: string) {
  return Math.min(5200, Math.max(2600, 1800 + 40 * text.length));
}

/** So lange hält er einen Satz gegen Beiläufiges. */
export function holdFor(text: string) {
  return 1200 + 45 * text.length;
}

/** Ein Satz ab `at`. Die Blase bleibt nach dem Sprechen noch {@link lingerMs}, beim Schnarchen immer. */
export function say(at: number, text: string, style: SayStyle = "speech", announce = true): SayCue {
  const untilMs = style === "snore" ? null : speechMs(text, STYLE_TEMPO[style]) + lingerMs(text);
  return { at, kind: "say", text, style, announce, untilMs };
}

/**
 * Dasselbe Skript, nur lesen Screenreader seine Sätze nicht vor. Für Sätze beim Blättern: Der Name
 * der Ware klingt schon, und vorgelesene Sätze stauten sich hinter der nächsten Wahl.
 */
export function unannounced(script: ScriptDraft): ScriptDraft {
  const cues = script.cues.map((cue) => (cue.kind === "say" ? { ...cue, announce: false } : cue));
  return { ...script, cues };
}

/** Wann der Satz zu Ende gesprochen ist, ab Skriptbeginn. */
export function sayEnd(cue: SayCue) {
  return cue.at + speechMs(cue.text, STYLE_TEMPO[cue.style]);
}

/** Sätze nacheinander: jeder {@link BEAT_GAP_MS} nach dem Ende des vorigen. */
export function beats(start: number, texts: string[], style: SayStyle = "speech"): SayCue[] {
  const cues: SayCue[] = [];
  for (const text of texts) {
    const previous = cues.at(-1);
    cues.push(say(previous ? sayEnd(previous) + BEAT_GAP_MS : start, text, style));
  }
  return cues;
}

/** Eine Geste ab `at`, ohne `seconds` mit ihrer üblichen Dauer. */
export function gesture(at: number, key: WizardGesture | null, extra: Partial<GestureCue> = {}) {
  return { at, kind: "gesture", gesture: key, ...extra } satisfies GestureCue;
}

/** Ein Blick ab `at`. */
export function gaze(at: number, target: GazeTarget): WizardCue {
  return { at, kind: "gaze", target };
}

/** Eine Stimmung ab `at`. */
export function mood(at: number, value: WizardMood): WizardCue {
  return { at, kind: "mood", mood: value };
}

/** Ein Geräusch bei `at`. */
export function sfx(at: number, sound: WizardSfx): WizardCue {
  return { at, kind: "sfx", sound };
}

/** Ein Effekt bei `at`. */
export function effect(at: number, kind: WizardEffect, itemId?: string): WizardCue {
  return itemId === undefined
    ? { at, kind: "effect", effect: kind }
    : { at, kind: "effect", effect: kind, itemId };
}

/** Ein Laut bei `at`. */
export function clip(at: number, key: WizardClipKey, extra: Partial<ClipCue> = {}): ClipCue {
  return { at, kind: "clip", clip: key, ...extra };
}

/** Die Kundschaft spielt mit, höchstens 2 s lang. */
export function customer(at: number, emote: EmoteKey | null, seconds: number, hop = false) {
  const cue: CustomerStep = { at, kind: "customer", emote, seconds: Math.min(2, seconds) };
  return hop ? { ...cue, hop: true as const } : cue;
}

/** Dieselben Einsätze, um `offset` später. */
export function shift(cues: readonly WizardCue[], offset: number): WizardCue[] {
  return cues.map((cue) => ({ ...cue, at: cue.at + offset }));
}

/** Wann ein Einsatz zu Ende ist, ab Skriptbeginn. */
export function cueEnd(cue: WizardCue) {
  switch (cue.kind) {
    case "say":
      return sayEnd(cue);
    case "gesture":
      return cue.at + 1000 * (cue.seconds ?? (cue.gesture ? GESTURE_SECONDS[cue.gesture] : 0));
    case "clip":
      return cue.at + (cue.everyMs ? (cue.untilMs ?? 0) : CLIP_MS[cue.clip]);
    case "customer":
      return cue.at + cue.seconds * 1000;
    default:
      return cue.at;
  }
}

/** Wie lange ein Skript läuft. */
export function scriptLength(script: Pick<WizardScript, "cues">) {
  return script.cues.reduce((end, cue) => Math.max(end, cueEnd(cue)), 0);
}

/** Optionen eines Skripts außer den Einsätzen. */
export type DraftOptions = Partial<Pick<WizardScript, "holdMs" | "lockMs" | "polite">>;

/**
 * Ein Skript. Ohne eigenes `holdMs` hält es sein Wort, bis der letzte Satz gehalten ist: je Satz
 * 1200 ms plus 45 ms je Zeichen ab seinem Beginn.
 */
export function draft(
  topic: string,
  priority: Priority,
  cues: WizardCue[],
  options: DraftOptions = {},
): ScriptDraft {
  const sorted = [...cues].sort((first, second) => first.at - second.at);
  const spoken = sorted.flatMap((cue) => (cue.kind === "say" ? [cue.at + holdFor(cue.text)] : []));
  return {
    topic,
    priority,
    cues: sorted,
    holdMs: options.holdMs ?? Math.max(0, ...spoken),
    lockMs: options.lockMs ?? 0,
    polite: options.polite ?? false,
  };
}

/** Alle Einsätze in zeitlicher Folge, wiederholte Laute einzeln. */
export function flattenCues(cues: readonly WizardCue[]): WizardCue[] {
  const flat = cues.flatMap((cue): WizardCue[] => {
    if (cue.kind !== "clip" || !cue.everyMs) return [cue];
    const { everyMs, untilMs = 0, ...single } = cue;
    const count = Math.max(1, Math.ceil(untilMs / everyMs));
    return Array.from({ length: count }, (_, index) => ({
      ...single,
      at: cue.at + index * everyMs,
    }));
  });
  return flat.sort((first, second) => first.at - second.at);
}
