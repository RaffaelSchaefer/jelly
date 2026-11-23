/**
 * Den Zauberer nerven, als reine Rechnung: Dreimal wehrt er den Griff nach dem Hut ab, beim vierten
 * ist der Hut weg. Am Bart ziehen geht immer. Wer ihm den Hut klaut und danach dreimal am Bart
 * zieht, hat ihn genug genervt ({@link TeaseState.fedUp}): Darauf antwortet er gekränkt. Nach einer
 * Weile zaubert er sich den Hut zurück, und alles beginnt von vorn.
 *
 * Der Stand lebt nur im Fenster, gespeichert oder gemeldet wird nichts. Wann ein Griff zählt,
 * entscheidet `wizardBrain.ts`: nur, wenn er auch antworten darf. Die Zeiten stehen in
 * `shopTimeline.ts`.
 *
 * @module
 */

import { TEASE } from "./shopTimeline";
import {
  clip,
  CLIP_MS,
  draft,
  effect,
  gaze,
  gesture,
  mood,
  say,
  sayEnd,
  scriptLength,
  sfx,
  type ScriptDraft,
  type ScriptKit,
  type WizardCue,
  type WizardMood,
} from "./wizardScripts";

/** Woran man ihn nervt. */
export type TeaseTarget = "hat" | "beard";

/** So oft wehrt er den Griff nach dem Hut ab, und so oft Ziehen am Bart ohne Hut reicht ihm. */
export const TEASE_RULES = { guards: 3, pulls: 3 } as const;

/** Wie weit das Nerven gediehen ist. */
export interface TeaseState {
  /** Abgewehrte Griffe nach dem Hut. */
  grabs: number;
  hatOff: boolean;
  /** Wie oft am Bart gezogen wurde, seit der Hut weg ist. */
  pulls: number;
  /** Genug genervt: Hut geklaut und danach dreimal am Bart gezogen. */
  fedUp: boolean;
  /** Wann er sich den Hut zurückzaubert, `Infinity` mit Hut. */
  backAt: number;
  /** So lange bleibt ein geklauter Hut fort. */
  backMs: number;
}

/**
 * Noch nicht genervt.
 *
 * @param backMs - Kürzer für die Vorschau.
 */
export function freshTease(backMs: number = TEASE.hatBack): TeaseState {
  return { grabs: 0, hatOff: false, pulls: 0, fedUp: false, backAt: Infinity, backMs };
}

/** Was ein Griff auslöst: sein Skript, der neue Stand und ob der Hut dabei geht. */
export interface TeaseReaction {
  draft: ScriptDraft;
  tease: TeaseState;
  hatOff?: true;
}

/** Ein Skript des Nervens: im Rang eines Stupsers. */
function teaseDraft(cues: WizardCue[]) {
  return draft("tease", 2, [gaze(0, "viewer"), ...cues]);
}

/** Abgewehrt: Er hält den Hut fest, zerrt ihn zurück und schimpft, jedes Mal anders. */
function guardScript(kit: ScriptKit, step: number) {
  const scold = say(250, kit.lineAt("tease.guard", step));
  const fuss = [mood(0, "indignant"), gesture(0, "guard"), sfx(0, "tug")];
  return teaseDraft([...fuss, scold, mood(sayEnd(scold) + TEASE.settle, "neutral")]);
}

/**
 * Der Hut ist weg: Er fährt hoch und greift ins Leere. Empört bleibt er, solange der Hut fehlt: Das
 * zeigt `wizardFrame` aus seinem Stand, nicht dieses Skript.
 */
function snatchScript(kit: ScriptKit) {
  return teaseDraft([
    mood(0, "startled"),
    gesture(0, "unhat"),
    sfx(0, "snap"),
    effect(0, "hatPuff"),
    clip(0, "oh"),
    mood(TEASE.snatch, "indignant"),
    say(TEASE.snatch + 200, kit.line("tease.snatched")),
  ]);
}

/** Der Bart dehnt sich und schnalzt zurück, er jault auf. Danach ist er wieder so wie `after`. */
function yankCues(after: WizardMood): WizardCue[] {
  return [
    mood(0, "startled"),
    gesture(0, "yank"),
    sfx(0, "tug"),
    sfx(TEASE.stretch, "snap"),
    clip(TEASE.stretch, "yelp"),
    mood(TEASE.stretch + CLIP_MS.yelp, after),
  ];
}

/** Am Bart gezogen: Er jault auf und beschwert sich. */
function yankScript(kit: ScriptKit) {
  const moan = say(TEASE.stretch + CLIP_MS.yelp + 150, kit.line("tease.beard"));
  const cues = [...yankCues("indignant"), moan, mood(sayEnd(moan) + TEASE.settle, "neutral")];
  return teaseDraft(cues);
}

/** Genug genervt: Nach dem Aufjaulen senkt er gekränkt den Blick und sagt es auch. */
function fedUpScript(kit: ScriptKit) {
  const hurtAt = TEASE.stretch + CLIP_MS.yelp + 300;
  const sigh = [gaze(hurtAt, "ledger"), clip(hurtAt, "hmm")];
  return teaseDraft([...yankCues("hurt"), ...sigh, say(hurtAt + 500, kit.line("tease.fedUp"))]);
}

/** Der Hut ist schon weg: Er schnaubt nur noch. */
function baldScript(kit: ScriptKit) {
  return teaseDraft([mood(0, "indignant"), gesture(0, "huff"), say(250, kit.line("tease.bald"))]);
}

/** Er zaubert sich den Hut zurück: Funken kreisen, der Hut erscheint, er rückt ihn zurecht. */
function hatBackScript(kit: ScriptKit) {
  const pleased = say(TEASE.conjure + 250, kit.line("tease.back"));
  const cues = [
    gaze(0, "viewer"),
    mood(0, "focused"),
    gesture(0, "rehat"),
    effect(0, "hatConjure"),
    sfx(TEASE.conjure, "hatTip"),
    mood(TEASE.conjure, "delighted"),
    pleased,
    mood(sayEnd(pleased) + TEASE.settle, "neutral"),
  ];
  // Er fällt sich nicht selbst ins Wort: Erst jault er zu Ende, dann zaubert er.
  return draft("tease", 2, cues, { polite: true });
}

/** Ein Griff nach dem Hut: abwehren, verlieren, oder er ist schon weg. */
function grabHat(kit: ScriptKit, state: TeaseState, now: number): TeaseReaction {
  if (state.hatOff) return { draft: baldScript(kit), tease: state };
  if (state.grabs < TEASE_RULES.guards) {
    return { draft: guardScript(kit, state.grabs), tease: { ...state, grabs: state.grabs + 1 } };
  }
  const tease = { ...state, hatOff: true, backAt: now + state.backMs };
  return { draft: snatchScript(kit), tease, hatOff: true };
}

/**
 * Ein Griff an Hut oder Bart. Gezählt wird das Ziehen am Bart erst ohne Hut. Wem es reicht, der
 * holt sich den Hut bald nach seiner gekränkten Antwort zurück.
 */
export function teaseReaction(
  kit: ScriptKit,
  state: TeaseState,
  target: TeaseTarget,
  now: number,
): TeaseReaction {
  if (target === "hat") return grabHat(kit, state, now);
  if (!state.hatOff) return { draft: yankScript(kit), tease: state };
  const pulls = state.pulls + 1;
  if (state.fedUp || pulls < TEASE_RULES.pulls) {
    return { draft: yankScript(kit), tease: { ...state, pulls } };
  }
  const hurt = fedUpScript(kit);
  const backAt = Math.min(state.backAt, now + scriptLength(hurt) + TEASE.sulk);
  return { draft: hurt, tease: { ...state, pulls, fedUp: true, backAt } };
}

/** Der Hut kommt zurück, die Zähler beginnen neu. */
export function hatReturn(kit: ScriptKit, state: TeaseState): TeaseReaction {
  return { draft: hatBackScript(kit), tease: freshTease(state.backMs) };
}
