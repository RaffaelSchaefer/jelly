/**
 * Das Gehirn des Zauberers als reiner Reduzierer: `wizardStep(mind, event, now)` nimmt ein Ereignis
 * (Hinweis der Oberfläche, Server, Eingabe, Sichtbarkeit oder fälliger Termin) und gibt höchstens
 * ein Skript, einen Blick und den nächsten Termin zurück. Es läuft nur bei Ereignissen.
 *
 * Vorrang: 0 Zauber, Verpuffen, LAN auf und zu; 1 Handlungen; 2 Server und Stupser; 3 Beiläufiges.
 * Ein neues Skript unterbricht, wenn es gleich- oder höherrangig ist oder das laufende sein Wort
 * nicht mehr hält. Sonst wartet Rang 0 bis 2 in einem Platz für 4 s, Rang 3 entfällt. Der Zufall
 * kommt aus dem Startwert: Dieselben Ereignisse geben dieselben Skripte. Zeiten in Millisekunden.
 *
 * Was er tut, steht in `wizard.ts`, wie er döst und sich beschäftigt, in `wizardIdle.ts`.
 *
 * @module
 */

import type { ShopItem } from "./shop";

import * as moment from "./wizard";
import * as rest from "./wizardIdle";
import {
  ATTENTION,
  attentionAt,
  attentionDue,
  contextChange,
  createScriptKit,
  EMPTY_HISTORY,
  itemSlots,
  leaveAttention,
  selectionPattern,
  slotsFor,
  wornAfter,
  type Attention,
  type Selection,
} from "./wizardPick";
import {
  mood,
  scriptLength,
  unannounced,
  UNKNOWN_CONTEXT,
  type Priority,
  type ScriptDraft,
  type ScriptKit,
  type WizardContext,
  type WizardEvent,
  type WizardLook,
  type WizardScript,
} from "./wizardScripts";

/** Was gerade läuft: das Skript mit Beginn und Ende. */
type Running = WizardScript & { startedAt: number; endsAt: number };

/** Zeiten des Gehirns. */
const BRAIN = {
  queueMs: 4000,
  /** Eine Wahl so kurz nach der vorigen ist Blättern, ihr Satz kommt 700 ms später. */
  browseMs: 1200,
  browseLineMs: 700,
  /**
   * Erst eine Wahl so lange nach der vorigen liest der Screenreader als Satz vor. Beim Blättern
   * sagt er schon den Namen der Ware.
   */
  announceGapMs: 1500,
  compareCooldownMs: 60_000,
  quipGapMs: 12_000,
  /** So lange nach dem Spruch gehört ein Kauf noch zu ihm. */
  commitMemoryMs: 10_000,
  /** So kurz nach dem Aufwecken gehört ein Klick noch zum Druck, der ihn weckte. */
  sameClickMs: 400,
} as const;

/**
 * Ein frisches Gedächtnis.
 *
 * @param seed - Startwert des Zufalls, etwa `Date.now()`.
 * @param timing - Kürzeres Dösen für die Vorschau.
 */
export function createWizardMind(seed: number, now: number, timing: Partial<rest.DozeTiming> = {}) {
  return {
    seed: seed >>> 0,
    nextId: 1,
    ctx: UNKNOWN_CONTEXT,
    lines: EMPTY_HISTORY,
    greeted: false,
    running: null as Running | null,
    /** Der eine Platz für ein Skript, das warten muss. */
    queued: null as { draft: ScriptDraft; until: number } | null,
    rest: rest.freshRest(now, timing),
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
    ladder: moment.FRESH_LADDER,
    merge: null as moment.ServerMerge | null,
  };
}

/** Alles, was er weiß und sich merkt. Nur über {@link wizardStep} ändern. */
export type WizardMind = ReturnType<typeof createWizardMind>;

/** Was ein Schritt ergibt. `interrupt`: Stimme verstummt, Geste klingt aus. */
export interface WizardStep {
  mind: WizardMind;
  script?: WizardScript;
  interrupt: boolean;
  look?: WizardLook;
  /** Der nächste Termin auf derselben Uhr wie `now`, `Infinity` für keinen. */
  nextTickAt: number;
}

/** Was ein Ereignis auslöst. */
type Act = { script?: WizardScript; interrupt?: boolean; look?: WizardLook } | null;

/** Eine Kopie, die sich in einem Schritt ändern lässt, ohne das Original zu berühren. */
function copyMind(m: WizardMind): WizardMind {
  return { ...m, once: [...m.once], rest: rest.copyRest(m.rest), hover: m.hover && { ...m.hover } };
}

/** Das laufende Skript, `null` wenn keins mehr läuft. */
function activeRun(m: WizardMind, now: number) {
  return m.running && now < m.running.endsAt ? m.running : null;
}

/** Ob ein Skript vom Rang `rank` oder wichtiger gerade sein Wort hält. */
function heldBy(m: WizardMind, now: number, rank: Priority) {
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
function start(m: WizardMind, draft: ScriptDraft, now: number, interrupt: boolean): Act {
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
function admits(m: WizardMind, draft: ScriptDraft, now: number) {
  const run = activeRun(m, now);
  if (!run) return "free";
  const outranks =
    draft.priority < run.priority || (draft.priority === run.priority && !draft.polite);
  const released = outranks || now >= run.startedAt + run.holdMs;
  return released && now >= run.startedAt + run.lockMs ? "interrupt" : null;
}

/** Bietet ein Skript an: Es beginnt, wartet im einen Platz oder entfällt. */
function offer(m: WizardMind, draft: ScriptDraft | null, now: number): Act {
  if (!draft) return null;
  const admitted = admits(m, draft, now);
  if (admitted) return start(m, draft, now, admitted === "interrupt");
  if (draft.priority <= 2) m.queued = { draft, until: now + BRAIN.queueMs };
  return null;
}

/** Merkt sich, dass `key` in diesem Fenster dran war. `false`, wenn es schon dran war. */
function once(m: WizardMind, key: string) {
  if (m.once.includes(key)) return false;
  m.once.push(key);
  return true;
}

/** Ein Teil nach seinem Schlüssel, aus dem Laden oder aus den letzten Wahlen. */
function findItem(m: WizardMind, id: string | null | undefined) {
  const known = (item: ShopItem) => item.cosmetic.id === id;
  const chosen = m.selections.map((entry) => entry.item).reverse();
  return (id && (m.ctx.items?.find(known) ?? chosen.find(known))) || null;
}

/** Eine Eingabe: Schläfrige Lider gehen auf. */
function lift(m: WizardMind, now: number): Act {
  return rest.sensePresence(m.rest, now) ? { look: { mood: "neutral" } } : null;
}

/** Eine Handlung der Kundschaft: Er ist wach und bietet das Skript an. */
function act(m: WizardMind, now: number, draft: ScriptDraft): Act {
  const look = lift(m, now);
  const played = offer(m, draft, now);
  return played ? { ...played, look: look?.look } : look;
}

/** Er wird geweckt und schreckt hoch. */
function wake(m: WizardMind, now: number, kit: ScriptKit): Act {
  rest.wakeUp(m.rest, now);
  return offer(m, rest.wakeScript(kit), now);
}

/** Sein Kommentar zur Wahl: Wiederholung, Vergleich, Wiedersehen oder ein neues Teil. */
function selectFor(m: WizardMind, item: ShopItem, now: number, kit: ScriptKit) {
  const id = item.cosmetic.id;
  const pattern = selectionPattern(m.selections, now);
  // Nach schnellem Blättern hat er schon genickt und spricht sofort.
  const lead = m.selections.at(-1)?.quick ? 0 : undefined;
  if (pattern.repeat && once(m, `repeat:${id}`)) {
    return moment.patternScript(kit, "select.repeat", item);
  }
  if (pattern.compare && now - m.compareAt >= BRAIN.compareCooldownMs) {
    m.compareAt = now;
    return moment.patternScript(kit, "select.compare", item);
  }
  if (m.discussed.includes(id)) return moment.revisitScript(kit, item);
  m.discussed = [...m.discussed, id];
  return moment.selectScript(kit, item, lead);
}

/** Eine Wahl im Schlaf oder gerade beim Aufschrecken: erst „Oh! …“, dann der Kommentar. */
function wakeChoice(m: WizardMind, item: ShopItem, now: number, kit: ScriptKit): Act {
  const run = activeRun(m, now);
  const since = run?.topic === "wake" ? now - run.startedAt : Infinity;
  const startled = since < rest.DOZE.wakeLineMs;
  if (m.rest.activity !== "asleep" && !startled) return null;
  rest.wakeUp(m.rest, now);
  const ohAt = startled ? rest.DOZE.wakeLineMs - since : rest.DOZE.wakeLineMs;
  const script = moment.wakeSelectScript(kit, selectFor(m, item, now, kit), startled, ohAt);
  return startled ? start(m, script, now, false) : offer(m, script, now);
}

/** Eine Wahl: Kommentar, nach schnellem Blättern nur ein Nicken und der Satz später. */
function onSelect(m: WizardMind, item: ShopItem, now: number, kit: ScriptKit): Act {
  const since = now - (m.selections.at(-1)?.at ?? -Infinity);
  const quick = since < BRAIN.browseMs;
  m.selections = [...m.selections, { item, at: now, quick }].slice(-8);
  const woke = wakeChoice(m, item, now, kit);
  if (woke) return woke;
  if (!m.greeted) {
    m.greeted = true;
    const hello = kit.line("greet.early", slotsFor(m.ctx));
    return act(m, now, moment.withPrefix(hello, selectFor(m, item, now, kit)));
  }
  if (since >= BRAIN.announceGapMs) return act(m, now, selectFor(m, item, now, kit));
  if (!quick) return act(m, now, unannounced(selectFor(m, item, now, kit)));
  m.pending = { item, at: now + BRAIN.browseLineMs };
  if (activeRun(m, now)?.topic === "browse") return lift(m, now);
  return act(m, now, moment.browseScript());
}

/** Gestupst: die Leiter hinauf. Im Schlaf schreckt er nur hoch. */
function onPoke(m: WizardMind, now: number, kit: ScriptKit): Act {
  if (m.rest.activity === "asleep") return wake(m, now, kit);
  // Der Druck, der ihn eben weckte, gehört zu diesem Klick: Er war der Stupser.
  const run = activeRun(m, now);
  if (run?.topic === "wake" && now - run.startedAt < BRAIN.sameClickMs) return null;
  const reaction = moment.pokeReaction(kit, m.ladder, now);
  m.ladder = reaction.ladder;
  return act(m, now, reaction.draft);
}

/** Neues Wissen. Kippt die LAN, öffnet oder schließt er; reicht es für ein Teil, zeigt er es. */
function onContext(m: WizardMind, patch: Partial<WizardContext>, now: number, kit: ScriptKit) {
  const change = contextChange(m.ctx, patch);
  m.ctx = change.ctx;
  if (change.lan !== null) return offer(m, moment.lanScript(kit, change.lan), now);
  if (!change.affordable) return null;
  const draft = moment.affordableScript(kit, change.affordable);
  const waiting = m.merge;
  if (!waiting) return offer(m, draft, now);
  // Erst die Münzen, dann was sie möglich machen.
  m.merge = null;
  const flushed = offer(m, moment.flushServer(kit, waiting), now);
  m.queued = { draft, until: now + BRAIN.queueMs };
  return flushed;
}

/** Die Bemerkung zum Verweilen auf einer Ware: einmal je Ware, höchstens alle 12 s. */
function quip(m: WizardMind, id: string, now: number, kit: ScriptKit) {
  if (!id || now - m.quipAt < BRAIN.quipGapMs || !once(m, `quip:${id}`)) return null;
  m.quipAt = now;
  return moment.quipScript(kit, itemSlots(m.ctx, findItem(m, id), id));
}

/** Die Ermunterung am Siegel: nur bei einer bezahlbaren Ware im offenen Laden, einmal je Ware. */
function encourage(m: WizardMind, id: string, kit: ScriptKit) {
  const offerable = findItem(m, id)?.state === "affordable" && m.ctx.open !== false;
  return offerable && once(m, `seal:${id}`) ? moment.sealScript(kit) : null;
}

/** Was er sagt, wenn der Zeiger lange genug verweilt: zur Börse, zum Siegel oder zur Ware. */
function remark(m: WizardMind, hover: Attention, now: number, kit: ScriptKit): Act {
  if (m.rest.activity !== "attending" || heldBy(m, now, 2)) return null;
  const id = hover.itemId ?? "";
  if (hover.target === "seal") return offer(m, encourage(m, id, kit), now);
  if (hover.target === "item") return offer(m, quip(m, id, now, kit), now);
  return offer(m, once(m, "purse") ? moment.purseScript(kit) : null, now);
}

/** Der Zeiger verweilt: erst ein Blick, später eine Bemerkung. Im Schlaf weckt es ihn. */
function attend(m: WizardMind, now: number, kit: ScriptKit): Act {
  const hover = m.hover;
  const due = attentionDue(hover, now, m.rest.activity === "asleep");
  if (!hover || !due) return null;
  if (due === "wake") return wake(m, now, kit);
  if (due === "remark") return remark(m, hover, now, kit);
  if (heldBy(m, now, 2)) return null;
  return { look: { gaze: ATTENTION.gazeAt[hover.target], mood: "attentive" } };
}

/** Dösen und Leerlauf, wenn sie dran sind. */
function restDue(m: WizardMind, now: number, kit: ScriptKit): Act {
  const doze = rest.dozeDue(m.rest, now, kit, heldBy(m, now, 2));
  if (doze) return offer(m, doze, now);
  const run = activeRun(m, now);
  const hovering = m.hover ? now + rest.IDLE_TIMING.minGapMs : null;
  const retry = run ? run.endsAt + rest.IDLE_TIMING.firstMs : hovering;
  return offer(m, rest.idleDue(m.rest, now, kit, retry), now);
}

/** Wann das wartende Skript beginnen darf oder verfällt. */
function queueAt(m: WizardMind) {
  if (!m.queued) return Infinity;
  const run = m.running;
  const hold = run ? run.startedAt + Math.max(run.holdMs, run.lockMs) : -Infinity;
  return Math.min(m.queued.until, run ? Math.min(run.endsAt, hold) : -Infinity);
}

/** Nimmt einen fälligen Termin aus dem Gedächtnis. */
function take<K extends "merge" | "pending">(m: WizardMind, key: K, now: number) {
  const waiting = m[key];
  if (!waiting || now < waiting.at) return null;
  m[key] = null as WizardMind[K];
  return waiting;
}

/** Fällige Termine, das wichtigste zuerst. Jeder rückt seinen Termin weiter, auch ohne Skript. */
const DUE: ((m: WizardMind, now: number, kit: ScriptKit) => Act)[] = [
  (m, now) => {
    const waiting = m.queued;
    if (!waiting || now < queueAt(m)) return null;
    // Fällig heißt: frei geworden oder verfallen. Verfallenes entfällt.
    m.queued = null;
    const admitted = now < waiting.until ? admits(m, waiting.draft, now) : null;
    return admitted ? start(m, waiting.draft, now, admitted === "interrupt") : null;
  },
  (m, now, kit) => {
    const waiting = take(m, "merge", now);
    return offer(m, waiting && moment.flushServer(kit, waiting), now);
  },
  (m, now, kit) => {
    // Aufgeschoben wird nur beim Blättern: Der Satz klingt, wird aber nicht vorgelesen.
    const waiting = take(m, "pending", now);
    return waiting && offer(m, unannounced(selectFor(m, waiting.item, now, kit)), now);
  },
  attend,
  (m, now) => {
    const due = m.looks.filter((entry) => entry.at <= now);
    m.looks = m.looks.filter((entry) => entry.at > now);
    return due.length > 0 ? { look: Object.assign({}, ...due.map((entry) => entry.look)) } : null;
  },
  restDue,
];

/** Der nächste Termin von allem, was noch aussteht. */
function nextTickAt(m: WizardMind) {
  return Math.min(
    queueAt(m),
    m.merge?.at ?? Infinity,
    m.pending?.at ?? Infinity,
    attentionAt(m.hover, m.rest.activity === "asleep"),
    ...m.looks.map((entry) => entry.at),
    rest.restDeadline(m.rest),
  );
}

/** Wie er auf ein Ereignis der Art `K` reagiert. */
type Handler<K extends WizardEvent["kind"]> = (
  m: WizardMind,
  event: Extract<WizardEvent, { kind: K }>,
  now: number,
  kit: ScriptKit,
) => Act;

/** Wie er auf jedes Ereignis reagiert. */
const HANDLERS: { [K in WizardEvent["kind"]]: Handler<K> } = {
  ready: (m, _, now, kit) => {
    if (m.greeted) return null;
    m.greeted = true;
    return offer(m, moment.greetScript(kit), now);
  },
  context: (m, { patch }, now, kit) => onContext(m, patch, now, kit),
  input: (m, { strong }, now, kit) => {
    if (m.rest.activity !== "asleep") return lift(m, now);
    return strong ? wake(m, now, kit) : offer(m, rest.stirInSleep(m.rest, now, kit), now);
  },
  tick: (m, _, now, kit) => DUE.reduce<Act>((done, due) => done ?? due(m, now, kit), null),
  hidden: (m, _, now) => {
    rest.hide(m.rest, now);
    m.hover = null;
    return null;
  },
  visible: (m, _, now, kit) => offer(m, rest.reveal(m.rest, now, kit), now),
  hover: (m, { target, itemId }, now) => {
    m.hover = { target, itemId: itemId ?? null, since: now, gazed: false, done: false };
    m.looks = [];
    return lift(m, now);
  },
  unhover: (m, _, now) => {
    m.looks = leaveAttention(m.hover, now);
    m.hover = null;
    return null;
  },
  select: (m, { item }, now, kit) => onSelect(m, item, now, kit),
  hold: (m, _, now) => act(m, now, moment.holdScript()),
  release: (m, _, now) => offer(m, moment.releaseScript(), now),
  commit: (m, _, now, kit) => {
    m.commitAt = now;
    return act(m, now, moment.commitScript(kit));
  },
  // Folgt der Kauf auf den Spruch, geht der Zauber nahtlos weiter.
  bought: (m, { item, timeline }, now, kit) => {
    const spoken = now - m.commitAt <= BRAIN.commitMemoryMs;
    const draft = moment.boughtScript(kit, item, timeline, !spoken);
    return activeRun(m, now)?.topic === "commit" ? start(m, draft, now, false) : act(m, now, draft);
  },
  buyFailed: (m, { item }, now, kit) => offer(m, moment.failedScript(kit, item), now),
  blocked: (m, { item, itemId }, now, kit) => {
    m.haggles += 1;
    return act(m, now, moment.blockedScript(kit, item ?? findItem(m, itemId), m.haggles - 1));
  },
  equipped: (m, { item, worn }, now, kit) => {
    m.ctx = { ...m.ctx, worn: wornAfter(m.ctx.worn, item, worn) };
    return act(m, now, moment.equippedScript(kit, item, worn));
  },
  poke: (m, _, now, kit) => onPoke(m, now, kit),
  server: (m, { event }, now, kit) => {
    const reaction = moment.serverReaction(kit, event, m.merge, now);
    m.merge = reaction.merge;
    return offer(m, reaction.draft, now);
  },
};

/**
 * Ein Schritt des Gehirns. Ändert `mind` nicht, sondern gibt das neue Gedächtnis zurück.
 *
 * @param now - Monotone Zeit in Millisekunden, etwa `performance.now()`.
 */
export function wizardStep(mind: WizardMind, event: WizardEvent, now: number): WizardStep {
  const m = copyMind(mind);
  const handle = HANDLERS[event.kind] as Handler<WizardEvent["kind"]>;
  const result = handle(m, event, now, createScriptKit(m));
  const { script, interrupt = false, look } = result ?? {};
  return { mind: m, script, interrupt, look, nextTickAt: nextTickAt(m) };
}
