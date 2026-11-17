/**
 * Was der Zauberer tut, wenn ihn niemand braucht: Bart streichen, in die Kugel schauen, das Jelly
 * mustern, Münzen zählen, summen. Lässt man ihn lange allein, gähnt er, nickt ein und schnarcht im
 * Takt seines Atems, bis ihn jemand weckt.
 *
 * Reine Rechnung mit eigenem Stand (`RestState`), den `wizardBrain.ts` hält. Die Funktionen ändern
 * den übergebenen Stand und liefern höchstens ein Skript, über den Vorrang entscheidet das Gehirn.
 * Alle Zeiten in Millisekunden.
 *
 * @module
 */

import { prophecy, slotsFor } from "./wizardPick";
import {
  clip,
  draft,
  effect,
  gaze,
  gesture,
  mood,
  say,
  sayEnd,
  sfx,
  type ScriptDraft,
  type ScriptKit,
  type WizardContext,
  type WizardCue,
} from "./wizardScripts";

/** Seine Beschäftigungen: Dauer, Gewicht bei der Wahl und Pause, bevor dieselbe wieder dran ist. */
export const IDLE_ROUTINES = {
  stroke: { ms: 3600, weight: 3, cooldownMs: 25_000 },
  consult: { ms: 4200, weight: 2, cooldownMs: 45_000 },
  peer: { ms: 2800, weight: 2, cooldownMs: 30_000 },
  count: { ms: 2800, weight: 1, cooldownMs: 60_000 },
  hum: { ms: 3600, weight: 1, cooldownMs: 60_000 },
} as const;

/** Eine Beschäftigung im Leerlauf. */
export type IdleRoutine = keyof typeof IDLE_ROUTINES;

/** Alle Beschäftigungen. */
const ROUTINES = Object.keys(IDLE_ROUTINES) as IdleRoutine[];

/** So viele Beschäftigungen weit schaut er voraus, damit nach 13 s immer eine frei ist. */
const LOOKAHEAD = 2;

/** Takt des Leerlaufs. */
export const IDLE_TIMING = {
  /** Die erste Beschäftigung nach dem letzten Skript. */
  firstMs: 6000,
  /** Danach eine alle 7 bis 13 s. */
  minGapMs: 7000,
  maxGapMs: 13_000,
  /** Höchstens ein Satz im Leerlauf je 30 s, eine Weissagung je 90 s. */
  lineGapMs: 30_000,
  prophecyGapMs: 90_000,
} as const;

/** Takt des Dösens. */
export const DOZE = {
  /** So lange ohne Eingabe, bis er schläfrig wird, und so lange danach, bis er einschläft. */
  drowsyMs: 40_000,
  asleepMs: 30_000,
  /** Ein Atemzug beim Schnarchen, wie `SNORE_PERIOD_SECONDS` im Paket. */
  snoreMs: 4200,
  /** So lange hört man ihn schnarchen, danach schläft er still. */
  snoreForMs: 180_000,
  /** Beim Schlafen blinzelt er höchstens alle 10 s, mit 30 % Wahrscheinlichkeit. */
  peekEveryMs: 10_000,
  peekChance: 0.3,
  /** Wann der Satz nach dem Aufschrecken kommt. */
  wakeLineMs: 500,
  /** Fenster so lange verdeckt: Er schläft, oder er begrüßt die Rückkehr. */
  awaySleepMs: 70_000,
  awayGreetMs: 30_000,
} as const;

/** Wie oft er nebenbei etwas sagt. */
const CHANCE = { prophecy: 0.4, peer: 0.35, count: 0.2 } as const;

/** Was er sich zum Leerlauf merkt. */
export interface IdleMemory {
  last: IdleRoutine | null;
  /** Was er als Nächstes vorhat. */
  planned: IdleRoutine | null;
  /** Wann jede Beschäftigung zuletzt begann. */
  startedAt: Partial<Record<IdleRoutine, number>>;
  /** Wann er im Leerlauf zuletzt etwas sagte oder weissagte. */
  lineAt: number;
  prophecyAt: number;
}

/** Die Weissagung der Kugel, aus echten Daten. */
export { prophecy };

/** Wach, schläfrig oder eingeschlafen. */
export type Activity = "attending" | "drowsy" | "asleep";

/** Takt des Einnickens, in der Vorschau kürzer. */
export interface DozeTiming {
  drowsyMs: number;
  asleepMs: number;
}

/** Sein Stand zwischen den Klicks. */
export interface RestState {
  activity: Activity;
  timing: DozeTiming;
  /** Wann er schläfrig wird, und wann er danach einschläft. */
  drowsyAt: number;
  asleepAt: number;
  asleepSince: number;
  /** Wann er zuletzt fast aufgewacht wäre, und ob er im Schlaf schon gemurmelt hat. */
  peekAt: number;
  mumbled: boolean;
  /** Seit wann das Fenster verdeckt ist. */
  hiddenSince: number | null;
  /** Wann die nächste Beschäftigung fällig ist. */
  idleAt: number;
  idle: IdleMemory;
}

/** Wach und ausgeruht, ab `now`. */
export function freshRest(now: number, timing: Partial<DozeTiming> = {}): RestState {
  const full = { drowsyMs: DOZE.drowsyMs, asleepMs: DOZE.asleepMs, ...timing };
  return {
    activity: "attending",
    timing: full,
    drowsyAt: now + full.drowsyMs,
    asleepAt: Infinity,
    asleepSince: 0,
    peekAt: 0,
    mumbled: false,
    hiddenSince: null,
    idleAt: now + IDLE_TIMING.firstMs,
    idle: { last: null, planned: null, startedAt: {}, lineAt: -Infinity, prophecyAt: -Infinity },
  };
}

/** Eine Kopie, die sich ändern lässt, ohne das Original zu berühren. */
export function copyRest(rest: RestState): RestState {
  return { ...rest, idle: { ...rest.idle, startedAt: { ...rest.idle.startedAt } } };
}

/**
 * Der nächste Termin: schläfrig werden, einschlafen oder sich beschäftigen. Verdeckt oder im Schlaf
 * keiner.
 */
export function restDeadline(rest: RestState) {
  if (rest.hiddenSince !== null || rest.activity === "asleep") return Infinity;
  return Math.min(rest.activity === "attending" ? rest.drowsyAt : rest.asleepAt, rest.idleAt);
}

/**
 * Jemand ist da. Vor dem Einschlafen beginnt die Zeit bis zum Dösen neu, schläfrige Lider gehen
 * wieder auf.
 *
 * @returns Ob er gerade schläfrig war.
 */
export function sensePresence(rest: RestState, now: number) {
  if (rest.activity === "asleep") return false;
  rest.drowsyAt = now + rest.timing.drowsyMs;
  if (rest.activity === "attending") return false;
  rest.activity = "attending";
  rest.asleepAt = Infinity;
  return true;
}

/** Er wacht auf. */
export function wakeUp(rest: RestState, now: number) {
  rest.activity = "attending";
  rest.drowsyAt = now + rest.timing.drowsyMs;
  rest.asleepAt = Infinity;
}

/** Er schläft ein. */
function fallAsleep(rest: RestState, now: number) {
  rest.activity = "asleep";
  rest.asleepSince = now;
  rest.peekAt = now;
  rest.mumbled = false;
}

/** Ein Gedanke nebenbei: leise, Screenreader schweigen. */
function aside(at: number, text: string) {
  return say(at, text, "thought", false);
}

/** Schläfrig: ein Gähnen, die Lider sinken. */
export function drowsyScript(kit: ScriptKit): ScriptDraft {
  const cues = [mood(0, "drowsy"), gesture(0, "yawn"), clip(0, "yawn")];
  return draft("drowsy", 3, [...cues, aside(300, kit.line("doze.yawn"))]);
}

/** Das Schnarchen ab `at`, im Takt seit dem Einschlafen, bis die 180 s um sind. */
function snoring(at: number, asleepFor: number): WizardCue[] {
  const breath = Math.ceil((asleepFor + at) / DOZE.snoreMs) * DOZE.snoreMs;
  const left = DOZE.snoreForMs - breath;
  const loop = clip(breath - asleepFor, "snore", { everyMs: DOZE.snoreMs, untilMs: left });
  return [gesture(at, "snore", { seconds: Infinity }), ...(left > 0 ? [loop] : [])];
}

/** Er schläft ein: Augen zu, „Zzz …“ bleibt stehen, Schnarchen im Takt des Atems. */
export function asleepScript(kit: ScriptKit): ScriptDraft {
  const cues = [mood(0, "asleep"), say(0, kit.line("doze.snore"), "snore")];
  return draft("asleep", 3, [...cues, ...snoring(0, 0)]);
}

/**
 * Ein Auge geht kurz auf, dann schläft er weiter. Beim ersten Mal murmelt er.
 *
 * @param asleepFor - Wie lange er schon schläft, damit das Schnarchen im Takt bleibt.
 */
export function peekScript(kit: ScriptKit, mumble: boolean, asleepFor: number): ScriptDraft {
  const cues: WizardCue[] = [gesture(0, "peek")];
  let resume = 1200;
  if (mumble) {
    const words = aside(200, kit.line("doze.mumble"));
    resume = sayEnd(words) + 2000;
    cues.push(clip(200, "mumble"), words, say(resume, kit.line("doze.snore"), "snore", false));
  }
  return draft("peek", 3, [...cues, ...snoring(resume, asleepFor)]);
}

/** Aufgeschreckt: Er fährt hoch, der Hut springt, nach 500 ms ein Satz. */
export function wakeScript(kit: ScriptKit): ScriptDraft {
  return draft("wake", 1, [
    mood(0, "startled"),
    gesture(0, "startle"),
    clip(0, "oh"),
    sfx(0, "snort"),
    effect(0, "hatSparkle"),
    gaze(0, "viewer"),
    mood(700, "attentive"),
    say(DOZE.wakeLineMs, kit.line("wake")),
    mood(3500, "neutral"),
  ]);
}

/** Zurück nach einer Weile: Er hat den Laden gehütet. */
export function returnScript(kit: ScriptKit): ScriptDraft {
  return draft("return", 3, [gaze(0, "viewer"), gesture(0, "nod"), say(200, kit.line("return"))]);
}

/** Die Pause bis zur nächsten Beschäftigung, gleichverteilt zwischen 7 und 13 s. */
export function idleGap(random: () => number) {
  return IDLE_TIMING.minGapMs + random() * (IDLE_TIMING.maxGapMs - IDLE_TIMING.minGapMs);
}

/** Wann jede Beschäftigung zuletzt begann. */
type Started = IdleMemory["startedAt"];

/** Ab wann `routine` nach ihrer Pause wieder dran sein darf. */
function readyAt(started: Started, routine: IdleRoutine) {
  return (started[routine] ?? -Infinity) + IDLE_ROUTINES[routine].cooldownMs;
}

/**
 * Ob nach `routine` ab `at` noch `depth` weitere Beschäftigungen folgen können, jede höchstens 13 s
 * nach der vorigen. Wer zu oft kurz hintereinander wählt, stünde sonst ohne freie Beschäftigung
 * da.
 */
function staysLively(started: Started, routine: IdleRoutine, at: number, depth: number): boolean {
  if (depth === 0) return true;
  const after = { ...started, [routine]: at };
  const until = at + IDLE_TIMING.maxGapMs;
  return ROUTINES.some(
    (next) =>
      next !== routine &&
      readyAt(after, next) <= until &&
      staysLively(after, next, until, depth - 1),
  );
}

/** Was er gerade tun darf: bei reduzierter Bewegung nichts, bei geschlossenem Laden nur die Kugel. */
function idlePool(ctx: WizardContext): IdleRoutine[] {
  if (ctx.calm) return [];
  return ctx.open === false ? ["consult"] : ROUTINES;
}

/** Eine Beschäftigung und wann sie frühestens beginnt. */
export interface IdleOpening {
  routine: IdleRoutine;
  at: number;
}

/**
 * Was zwischen `from` und `until` beginnen kann, jeweils so früh wie möglich: nicht dasselbe wie
 * zuletzt, nichts in seiner Pause und nichts, wonach bald keine Beschäftigung mehr frei wäre. Bei
 * geschlossenem Laden bleibt nur die Kugel, dann zählt allein ihre Pause.
 *
 * @param lookahead - So viele Beschäftigungen weit schaut er voraus.
 */
export function idleOpenings(
  memory: IdleMemory,
  ctx: WizardContext,
  { from, until }: { from: number; until: number },
  lookahead = LOOKAHEAD,
): IdleOpening[] {
  const pool = idlePool(ctx);
  const lone = pool.length === 1;
  return pool.flatMap((routine) => {
    const at = Math.max(from, readyAt(memory.startedAt, routine));
    const fresh = lone || routine !== memory.last;
    const ok =
      at <= until && fresh && (lone || staysLively(memory.startedAt, routine, at, lookahead));
    return ok ? [{ routine, at }] : [];
  });
}

/** Wählt nach Gewicht. `null`, wenn nichts in Frage kommt. */
function pickOpening(openings: IdleOpening[], random: () => number) {
  const weight = (opening: IdleOpening) => IDLE_ROUTINES[opening.routine].weight;
  let left = random() * openings.reduce((sum, opening) => sum + weight(opening), 0);
  return openings.find((opening) => (left -= weight(opening)) < 0) ?? openings.at(-1) ?? null;
}

/**
 * Plant die Beschäftigung nach einer, die bei `now` begann: nach 7 bis 13 s. Wird es eng, wartet er
 * die vollen 13 s, und nur wenn auch das nicht reicht, länger.
 */
export function planIdle(
  memory: IdleMemory,
  ctx: WizardContext,
  now: number,
  random: () => number,
) {
  const until = now + IDLE_TIMING.maxGapMs;
  const options = [
    idleOpenings(memory, ctx, { from: now + idleGap(random), until }),
    idleOpenings(memory, ctx, { from: until, until }),
    idleOpenings(memory, ctx, { from: until, until: Infinity }, 0),
  ].find((list) => list.length > 0);
  return options ? pickOpening(options, random) : null;
}

/** Die geplante Beschäftigung, wenn sie jetzt geht, sonst eine, die gerade frei ist. */
function dueRoutine(memory: IdleMemory, ctx: WizardContext, now: number, random: () => number) {
  const { planned } = memory;
  if (planned && idlePool(ctx).includes(planned) && readyAt(memory.startedAt, planned) <= now) {
    return planned;
  }
  const window = { from: now, until: now };
  const open = idleOpenings(memory, ctx, window);
  return (
    pickOpening(open.length > 0 ? open : idleOpenings(memory, ctx, window, 0), random)?.routine ??
    null
  );
}

/** Die Kugel befragen: Hände um die Kugel, sie summt und glänzt, manchmal eine Weissagung. */
function consult(kit: ScriptKit, mayProphesy: boolean): WizardCue[] {
  const cues = [
    gaze(0, "orb"),
    mood(0, "focused"),
    gesture(0, "cast", { seconds: 4.2 }),
    sfx(0, "orbHum"),
    effect(1500, "orbGlint"),
    mood(4200, "neutral"),
  ];
  if (!mayProphesy || !kit.chance(CHANCE.prophecy)) return cues;
  const { topic, slots } = prophecy(kit.ctx);
  const text = kit.line(topic, { ...slotsFor(kit.ctx), ...slots });
  return [...cues, say(2600, text, "speech", false)];
}

/** Das Jelly mustern, manchmal mit einer Bemerkung zu dem, was es trägt. */
function peer(kit: ScriptKit, mayTalk: boolean): WizardCue[] {
  const cues = [
    gaze(0, "customer"),
    mood(0, "attentive"),
    gaze(2800, "viewer"),
    mood(2800, "neutral"),
  ];
  if (!mayTalk || !kit.chance(CHANCE.peer)) return cues;
  const topic = kit.ctx.worn?.length === 0 ? "idle.bare" : "idle.peer";
  return [...cues, aside(900, kit.line(topic, slotsFor(kit.ctx)))];
}

/** Münzen zählen, drei Tipper mit Klimpern, manchmal laut gezählt. */
function count(kit: ScriptKit, mayTalk: boolean): WizardCue[] {
  const taps = [300, 585, 870].map((at) => sfx(at, "coinClink"));
  const cues = [gaze(0, "purse"), gesture(0, "count"), ...taps, gaze(2800, "viewer")];
  return mayTalk && kit.chance(CHANCE.count)
    ? [...cues, aside(1400, kit.line("idle.count"))]
    : cues;
}

/** Die Beschäftigungen ohne Worte. */
const QUIET = {
  stroke: [gesture(0, "stroke"), clip(600, "hmm"), gaze(0, "customer"), gaze(2400, "viewer")],
  hum: [
    mood(0, "delighted"),
    clip(0, "hum"),
    gaze(0, "orb"),
    mood(3600, "neutral"),
    gaze(3600, "viewer"),
  ],
} satisfies Partial<Record<IdleRoutine, WizardCue[]>>;

/** Die Einsätze zu `routine`. Sätze nur alle 30 s, Weissagungen alle 90 s. */
function routineCues(kit: ScriptKit, routine: IdleRoutine, memory: IdleMemory, now: number) {
  const mayTalk = now - memory.lineAt >= IDLE_TIMING.lineGapMs;
  if (routine === "consult") {
    return consult(kit, mayTalk && now - memory.prophecyAt >= IDLE_TIMING.prophecyGapMs);
  }
  if (routine === "peer") return peer(kit, mayTalk);
  if (routine === "count") return count(kit, mayTalk);
  return QUIET[routine];
}

/** Spielt eine Beschäftigung und merkt sich, was er dabei getan und gesagt hat. */
export function idleScript(kit: ScriptKit, routine: IdleRoutine, rest: RestState, now: number) {
  const cues = routineCues(kit, routine, rest.idle, now);
  const spoke = cues.some((cue) => cue.kind === "say");
  rest.idle = {
    ...rest.idle,
    last: routine,
    startedAt: { ...rest.idle.startedAt, [routine]: now },
    lineAt: spoke ? now : rest.idle.lineAt,
    prophecyAt: spoke && routine === "consult" ? now : rest.idle.prophecyAt,
  };
  return draft(`idle.${routine}`, 3, cues);
}

/**
 * Fällige Termine des Dösens: nach 40 s ohne Eingabe schläfrig, 30 s später eingeschlafen. Hält
 * gerade ein wichtiges Skript sein Wort (`busy`), wartet er eine Sekunde.
 */
export function dozeDue(rest: RestState, now: number, kit: ScriptKit, busy: boolean) {
  if (rest.hiddenSince !== null || rest.activity === "asleep") return null;
  const drowsy = rest.activity === "drowsy";
  if (now < (drowsy ? rest.asleepAt : rest.drowsyAt)) return null;
  if (busy) {
    if (drowsy) rest.asleepAt = now + 1000;
    else rest.drowsyAt = now + 1000;
    return null;
  }
  if (drowsy) {
    fallAsleep(rest, now);
    return asleepScript(kit);
  }
  rest.activity = "drowsy";
  rest.asleepAt = now + rest.timing.asleepMs;
  return drowsyScript(kit);
}

/**
 * Die nächste Beschäftigung, wenn sie fällig ist und er wach und ungestört ist. Danach plant er
 * gleich die übernächste.
 *
 * @param retryAt - Wann es frühestens geht, weil gerade etwas anderes läuft. `null` heißt frei.
 */
export function idleDue(rest: RestState, now: number, kit: ScriptKit, retryAt: number | null) {
  if (now < rest.idleAt) return null;
  if (retryAt !== null || rest.activity !== "attending" || rest.hiddenSince !== null) {
    rest.idleAt = Math.max(retryAt ?? 0, now + IDLE_TIMING.minGapMs);
    return null;
  }
  const due = dueRoutine(rest.idle, kit.ctx, now, kit.random);
  const script = due && idleScript(kit, due, rest, now);
  const plan = planIdle(rest.idle, kit.ctx, now, kit.random);
  rest.idle = { ...rest.idle, planned: plan?.routine ?? null };
  rest.idleAt = plan?.at ?? now + idleGap(kit.random);
  return script;
}

/** Eine Bewegung des Zeigers, während er schläft: Manchmal blinzelt er. */
export function stirInSleep(rest: RestState, now: number, kit: ScriptKit) {
  if (now - rest.peekAt < DOZE.peekEveryMs) return null;
  rest.peekAt = now;
  if (!kit.chance(DOZE.peekChance)) return null;
  const mumble = !rest.mumbled;
  rest.mumbled = true;
  return peekScript(kit, mumble, now - rest.asleepSince);
}

/** Das Fenster wird verdeckt: Leerlauf und Dösen ruhen. */
export function hide(rest: RestState, now: number) {
  rest.hiddenSince ??= now;
}

/**
 * Das Fenster ist wieder zu sehen. Nach 70 s schläft er, nach 30 s begrüßt er die Rückkehr, sonst
 * geht es weiter wie zuvor.
 */
export function reveal(rest: RestState, now: number, kit: ScriptKit) {
  const since = rest.hiddenSince;
  rest.hiddenSince = null;
  if (since === null || rest.activity === "asleep") return null;
  rest.idleAt = Math.max(rest.idleAt, now + IDLE_TIMING.firstMs);
  if (now - since >= DOZE.awaySleepMs) {
    fallAsleep(rest, now);
    return asleepScript(kit);
  }
  sensePresence(rest, now);
  return now - since >= DOZE.awayGreetMs ? returnScript(kit) : null;
}
