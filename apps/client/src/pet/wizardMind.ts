/**
 * Das Gedächtnis des Zauberers: alles, was er weiß und sich zwischen zwei Ereignissen merkt. Sein
 * Gehirn (`wizardBrain.ts`) ändert es nur über `wizardStep`, in einer Kopie je Schritt.
 *
 * @module
 */

import type { ShopItem } from "./shop";

import { FRESH_LADDER, type ServerMerge } from "./wizard";
import { copyRest, freshRest, type DozeTiming } from "./wizardIdle";
import { EMPTY_HISTORY, type Attention, type Selection } from "./wizardPick";
import {
  UNKNOWN_CONTEXT,
  type ScriptDraft,
  type WizardLook,
  type WizardScript,
} from "./wizardScripts";
import { freshTease } from "./wizardTease";

/** Was gerade läuft: das Skript mit Beginn und Ende. */
type Running = WizardScript & { startedAt: number; endsAt: number };

/** Kürzere Zeiten für die Vorschau: das Dösen und wie lange ein geklauter Hut fort bleibt. */
export type MindTiming = Partial<DozeTiming> & { hatBackMs?: number };

/**
 * Ein frisches Gedächtnis.
 *
 * @param seed - Startwert des Zufalls, etwa `Date.now()`.
 * @param timing - Kürzere Zeiten für die Vorschau.
 */
export function createWizardMind(seed: number, now: number, timing: MindTiming = {}) {
  const { hatBackMs, ...doze } = timing;
  return {
    seed: seed >>> 0,
    nextId: 1,
    ctx: UNKNOWN_CONTEXT,
    lines: EMPTY_HISTORY,
    greeted: false,
    running: null as Running | null,
    /** Der eine Platz für ein Skript, das warten muss. */
    queued: null as { draft: ScriptDraft; until: number } | null,
    rest: freshRest(now, doze),
    hover: null as Attention | null,
    /** Blicke, die noch kommen, etwa zurück nach vorn. */
    looks: [] as { at: number; look: WizardLook }[],
    selections: [] as Selection[],
    /** Der Satz zur letzten Wahl nach schnellem Blättern. */
    pending: null as { item: ShopItem; at: number } | null,
    discussed: [] as string[],
    /** Was je Fenster nur einmal kommt. */
    once: [] as string[],
    compareAt: -Infinity,
    quipAt: -Infinity,
    haggles: 0,
    commitAt: -Infinity,
    ladder: FRESH_LADDER,
    merge: null as ServerMerge | null,
    /** Wie weit das Nerven an Hut und Bart gediehen ist. */
    tease: freshTease(hatBackMs),
  };
}

/** Alles, was er weiß und sich merkt. Nur über `wizardStep` ändern. */
export type WizardMind = ReturnType<typeof createWizardMind>;

/** Eine Kopie, die sich in einem Schritt ändern lässt, ohne das Original zu berühren. */
export function copyMind(m: WizardMind): WizardMind {
  return { ...m, once: [...m.once], rest: copyRest(m.rest), hover: m.hover && { ...m.hover } };
}
