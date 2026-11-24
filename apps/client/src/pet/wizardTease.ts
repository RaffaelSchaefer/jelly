/**
 * Den Zauberer nerven, als reine Rechnung: Dreimal wehrt er den Griff nach dem Hut ab, beim vierten
 * ist der Hut weg. Am Bart ziehen geht immer. Wer ihm den Hut klaut und danach dreimal am Bart
 * zieht, hat ihn genug genervt ({@link TeaseState.fedUp}): Darauf antwortet er gekränkt. Nach einer
 * Weile zaubert er sich den Hut zurück, und alles beginnt von vorn.
 *
 * Der Stand lebt im Fenster. Nur der geklaute Hut geht an den Server (`POST /v1/wizard-hat`):
 * Bekommt ihn das eigene Jelly, bestimmt der Server, wann er zurückkommt, und Kränken kürzt nichts.
 * Trägt ihn ein anderes Jelly, steht er ohne Hut da, bis der Server ihn freigibt ({@link
 * syncServerHat}). Ohne LAN, ohne Netz oder ausgeblendet bleibt alles im Fenster. Wann ein Griff
 * zählt, entscheidet `wizardBrain.ts`: nur, wenn er auch antworten darf. Die Zeiten stehen in
 * `shopTimeline.ts`.
 *
 * @module
 */

import { TEASE } from "./shopTimeline";
import { hatTimeWords, type HatHolder, type ServerHat } from "./wizardHat";
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
  type WizardLook,
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
  /** Wer den Hut laut Server trägt. Dann sagt der Server, wann er zurückkommt. */
  holder: HatHolder | null;
}

/**
 * Noch nicht genervt.
 *
 * @param backMs - Kürzer für die Vorschau.
 */
export function freshTease(backMs: number = TEASE.hatBack): TeaseState {
  return {
    grabs: 0,
    hatOff: false,
    pulls: 0,
    fedUp: false,
    backAt: Infinity,
    backMs,
    holder: null,
  };
}

/**
 * Was ein Griff auslöst: sein Skript, der neue Stand und ob der Hut dabei geht. `steal`: Der Hut
 * ist eben geklaut, der Shop fragt den Server, ob das Jelly ihn tragen darf.
 */
export interface TeaseReaction {
  draft: ScriptDraft;
  tease: TeaseState;
  hatOff?: true;
  steal?: true;
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
function snatchScript(kit: ScriptKit, line = kit.line("tease.snatched")) {
  return teaseDraft([
    mood(0, "startled"),
    gesture(0, "unhat"),
    sfx(0, "snap"),
    effect(0, "hatPuff"),
    clip(0, "oh"),
    mood(TEASE.snatch, "indignant"),
    say(TEASE.snatch + 200, line),
  ]);
}

/** Wer seinen Hut trägt und wie lange noch, als Satz. */
function takenLine(kit: ScriptKit, state: TeaseState, now: number) {
  const slots = { holder: state.holder?.name, remaining: hatTimeWords(state.backAt - now) };
  return kit.line("tease.taken", slots);
}

/** Ein anderes Jelly trägt seinen Hut: Er schnaubt und sagt, wer und wie lange noch. */
function takenScript(kit: ScriptKit, state: TeaseState, now: number) {
  const line = say(250, takenLine(kit, state, now));
  return teaseDraft([mood(0, "indignant"), gesture(0, "huff"), line]);
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
  if (state.hatOff && state.holder && !state.holder.mine) {
    return { draft: takenScript(kit, state, now), tease: state };
  }
  if (state.hatOff) return { draft: baldScript(kit), tease: state };
  if (state.grabs < TEASE_RULES.guards) {
    return { draft: guardScript(kit, state.grabs), tease: { ...state, grabs: state.grabs + 1 } };
  }
  const tease = { ...state, hatOff: true, backAt: now + state.backMs };
  return { draft: snatchScript(kit), tease, hatOff: true, steal: true };
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
  // Trägt das Jelly den Hut beim Server, kommt er erst zurück, wenn der Server ihn freigibt.
  const sulked = now + scriptLength(hurt) + TEASE.sulk;
  const backAt = state.holder ? state.backAt : Math.min(state.backAt, sulked);
  return { draft: hurt, tease: { ...state, pulls, fedUp: true, backAt } };
}

/** Der Hut kommt zurück, die Zähler beginnen neu. */
export function hatReturn(kit: ScriptKit, state: TeaseState): TeaseReaction {
  return { draft: hatBackScript(kit), tease: freshTease(state.backMs) };
}

/** Was der Server am Hut ändert: der neue Stand, wie der Hut aussieht und was er dazu sagt. */
export interface HatSync {
  tease: TeaseState;
  look?: WizardLook;
  draft?: ScriptDraft;
}

/** Der Server gibt den Hut frei: Hat er ihn verliehen, zaubert er ihn sich gleich zurück. */
function hatFreed(state: TeaseState, now: number): HatSync {
  if (!state.holder) return { tease: state };
  return { tease: { ...state, holder: null, backAt: state.hatOff ? now : Infinity } };
}

/**
 * Ein anderes Jelly nimmt ihm den Hut, während er ihn trägt. Beim Öffnen des Shops ist er schon
 * weg, ohne Flug. Sonst verpufft er, und er sagt, wer ihn hat.
 */
function hatVanished(kit: ScriptKit, tease: TeaseState, now: number, opening: boolean): HatSync {
  const look: WizardLook = { hatOff: true, ...(opening ? { hatInstant: true as const } : {}) };
  if (opening || tease.holder?.mine) return { tease, look };
  return { tease, look, draft: snatchScript(kit, takenLine(kit, tease, now)) };
}

/**
 * Gleicht den Hut mit dem Server ab, bei jedem neuen Stand. Derselbe Träger rückt nur die Rückkehr
 * zurecht. Ein Stand ohne Träger gibt nur einen Hut zurück, den der Server verliehen hatte: Während
 * der Shop noch fragt oder ohne Server bleibt der Hut, wo er ist.
 *
 * @param hat - Was der Stand sagt, `null` ohne Träger.
 * @param opening - Ob der Shop gerade erst aufgeht und er noch niemanden begrüßt hat.
 */
export function syncServerHat(
  kit: ScriptKit,
  state: TeaseState,
  hat: ServerHat | null,
  { now, opening }: { now: number; opening: boolean },
): HatSync {
  if (!hat) return hatFreed(state, now);
  const holder = { mine: hat.mine, name: hat.name };
  const tease = { ...state, holder, backAt: now + hat.remainingMs };
  if (!state.hatOff) return hatVanished(kit, { ...tease, hatOff: true, grabs: 0 }, now, opening);
  // Er hatte ihn eben selbst verloren, doch ein anderes Jelly war schneller: Er sagt, wer.
  const raced = !state.holder && !hat.mine;
  return raced ? { tease, draft: takenScript(kit, tease, now) } : { tease };
}

/**
 * Der Server lehnt den Diebstahl ab, weil ein anderes Jelly schneller war. Nennt der Stand den
 * Träger, gilt dessen Zeit. Sonst zaubert er sich den Hut bald zurück, nach `TEASE.taken`.
 */
export function stealRefused(state: TeaseState, now: number): TeaseState {
  if (!state.hatOff || state.holder) return state;
  return { ...state, backAt: Math.min(state.backAt, now + TEASE.taken) };
}
