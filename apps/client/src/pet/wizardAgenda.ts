/**
 * Wann ein Skript des Zauberers beginnt: Vorrang, Wort halten, der eine Platz zum Warten und wie
 * ein Skript beginnt. Gehört zu seinem Gehirn (`wizardBrain.ts`), das allein diese Helfer ruft und
 * dabei nur die Kopie seines Gedächtnisses ändert.
 *
 * @module
 */

import * as rest from "./wizardIdle";
import { type WizardMind } from "./wizardMind";
import {
  mood,
  scriptLength,
  type Priority,
  type ScriptDraft,
  type WizardLook,
  type WizardScript,
} from "./wizardScripts";

/** So lange wartet ein Skript im einen Platz, bis es entfällt. */
export const QUEUE_MS = 4000;

/** Was ein Ereignis auslöst. `steal`: Der Shop fragt den Server nach dem Hut. */
export type Act = {
  script?: WizardScript;
  interrupt?: boolean;
  look?: WizardLook;
  steal?: true;
} | null;

/** Das laufende Skript, `null` wenn keins mehr läuft. */
export function activeRun(m: WizardMind, now: number) {
  return m.running && now < m.running.endsAt ? m.running : null;
}

/** Ob ein Skript vom Rang `rank` oder wichtiger gerade sein Wort hält. */
export function heldBy(m: WizardMind, now: number, rank: Priority) {
  const run = activeRun(m, now);
  return run !== null && run.priority <= rank && now < run.startedAt + run.holdMs;
}

/** Wer etwas Wichtiges zu tun hat, ist wach. Ohne eigene Stimmung öffnet er die Augen. */
function awake(m: WizardMind, draft: ScriptDraft, now: number): ScriptDraft {
  if (draft.priority > 2 || m.rest.activity === "attending") return draft;
  rest.wakeUp(m.rest, now);
  const opens = draft.cues.some((cue) => cue.kind === "mood" && cue.at === 0);
  return opens ? draft : { ...draft, cues: [mood(0, "neutral"), ...draft.cues] };
}

/** Beginnt ein Skript. */
export function start(m: WizardMind, draft: ScriptDraft, now: number, interrupt: boolean): Act {
  const script = { ...awake(m, draft, now), id: m.nextId };
  m.nextId += 1;
  const endsAt = now + scriptLength(script);
  m.running = { ...script, startedAt: now, endsAt };
  // Eine neue Handlung macht den aufgeschobenen Satz zur Wahl überflüssig.
  if (script.priority <= 1 && script.topic !== "browse") m.pending = null;
  if (!script.topic.startsWith("idle.") && Number.isFinite(endsAt)) {
    m.rest.idleAt = endsAt + rest.IDLE_TIMING.firstMs;
  }
  return { script, interrupt };
}

/** Ob `draft` jetzt beginnen darf: `free` ohne laufendes Skript, `interrupt` über es hinweg. */
export function admits(m: WizardMind, draft: ScriptDraft, now: number) {
  const run = activeRun(m, now);
  if (!run) return "free";
  const outranks =
    draft.priority < run.priority || (draft.priority === run.priority && !draft.polite);
  const released = outranks || now >= run.startedAt + run.holdMs;
  return released && now >= run.startedAt + run.lockMs ? "interrupt" : null;
}

/** Bietet ein Skript an: Es beginnt, wartet im einen Platz oder entfällt. */
export function offer(m: WizardMind, draft: ScriptDraft | null, now: number): Act {
  if (!draft) return null;
  const admitted = admits(m, draft, now);
  if (admitted) return start(m, draft, now, admitted === "interrupt");
  if (draft.priority <= 2) m.queued = { draft, until: now + QUEUE_MS };
  return null;
}

/** Eine Eingabe: Schläfrige Lider gehen auf. */
export function lift(m: WizardMind, now: number): Act {
  return rest.sensePresence(m.rest, now) ? { look: { mood: "neutral" } } : null;
}

/** Eine Handlung der Kundschaft: Er ist wach und bietet das Skript an. */
export function act(m: WizardMind, now: number, draft: ScriptDraft): Act {
  const look = lift(m, now);
  const played = offer(m, draft, now);
  return played ? { ...played, look: look?.look } : look;
}
