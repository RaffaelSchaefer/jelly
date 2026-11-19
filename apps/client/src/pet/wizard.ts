/**
 * Was der Zauberer zu den Momenten im Laden sagt und tut, als reine Rechnung: Begrüßung, Wahl,
 * Kauf, Feilschen, Anlegen, Verweilen, Ereignisse vom Server und Stupser. Jeder Moment wird ein
 * Skript aus `wizardScripts.ts`, den Anlass sucht `wizardPick.ts` aus. Wann er es spielt,
 * entscheidet `wizardBrain.ts`. Seine Stimme steht in `wizardVoice.ts`, seine Laute in
 * `wizardClips.ts`.
 *
 * @module
 */

import type { ShopItem } from "./shop";
import type { PurchaseTimeline } from "./shopTimeline";
import type { ServerEvent } from "./types";
import type { LineSlots, LineTopic } from "./wizardLines";

import { coinLabel } from "./cosmetics";
import { greetTopic, MIXED_GREETINGS, selectPlan, slotsFor, suggestionFor } from "./wizardPick";
import {
  beats,
  clip,
  cueAtSlot,
  customer,
  draft,
  effect,
  gaze,
  gesture,
  holdFor,
  mood,
  say,
  sayEnd,
  sfx,
  shift,
  type SayCue,
  type ScriptDraft,
  type ScriptKit,
  type WizardCue,
  type WizardGesture,
} from "./wizardScripts";

/** So lange nach einer Wahl spricht er: erst ein Blick zum Jelly, dann der Satz. */
export const SELECT_LEAD_MS = 350;

/** Die Begrüßung beginnt nach dem Griff an den Hut. */
const GREET_SAY_MS = 300;

/** So lange hält er den Zauber geladen, bis ihn etwas löst. */
const CHARGE_MS = 30_000;

/** Der Vorschlag kommt so lange nach den Glückwünschen. */
const SUGGEST_AFTER_MS = 1500;

/** Die Tipper beim Münzenzählen, wie `countTapTimes` im Paket. */
export const COUNT_TAP = { firstMs: 300, stepMs: 285, most: 5 } as const;

/** Was nach dem ersten Satz der Begrüßung noch kommt. */
const GREET_BEAT: Partial<Record<LineTopic, LineTopic>> = {
  "greet.first": "greet.intro",
  "greet.closed": "greet.closedBeat",
};

/** Die Begrüßung: Griff an den Hut oder erhobene Hand, Satz mit Namen, das Jelly winkt zurück. */
export function greetScript(kit: ScriptKit): ScriptDraft {
  const fitting = greetTopic(kit.ctx);
  const topic = MIXED_GREETINGS.includes(fitting) && kit.chance(0.4) ? "greet.hello" : fitting;
  const beat = GREET_BEAT[topic];
  const lines = [kit.line(topic, slotsFor(kit.ctx)), ...(beat ? [kit.line(beat)] : [])];
  const hail = topic === "greet.first";
  return draft("greet", 1, [
    gaze(0, "viewer"),
    gesture(0, hail ? "hail" : "tip"),
    ...(hail ? [] : [sfx(250, "hatTip")]),
    ...beats(GREET_SAY_MS, lines),
    customer(200, "wave", 1.6),
  ]);
}

/** Die Hand kommt 300 ms vor dem Namen des Teils, ohne Namen mit dem Satz. */
function onName(cue: SayCue, name: string) {
  const index = cue.text.indexOf(name);
  return index < 0 ? cue.at : Math.max(0, cue.at + cueAtSlot(cue.text, index) - 300);
}

/**
 * Sein Kommentar zu einer Wahl: Blick zum Jelly, ein Satz mit Geste auf dem Namen und vielleicht
 * ein zweiter.
 *
 * @param lead - Wann er spricht. Nach schnellem Blättern sofort, er hat schon genickt.
 */
export function selectScript(kit: ScriptKit, item: ShopItem, lead = SELECT_LEAD_MS) {
  const plan = selectPlan(kit.ctx, item);
  const slots = slotsFor(kit.ctx, item);
  const lines = [kit.line(plan.topic, slots), ...(plan.beat ? [kit.line(plan.beat, slots)] : [])];
  const spoken = beats(lead, lines);
  const [first, second] = spoken;
  const cues: WizardCue[] = [gaze(0, "customer"), ...spoken];
  if (first) cues.push(gesture(onName(first, item.cosmetic.name), plan.gesture));
  if (second) cues.push(gaze(second.at, "viewer"));
  if (second && plan.think) cues.push(customer(second.at, "think", 2));
  if (plan.shy) cues.push(customer(300, "shy", 1.8));
  return draft("select", 1, cues);
}

/** Beim schnellen Blättern: nur ein Blick zum Jelly und ein Nicken. */
export function browseScript(): ScriptDraft {
  return draft("browse", 1, [gaze(0, "customer"), gesture(0, "nod")]);
}

/** Ein Muster beim Wählen: Vergleichen, Wiederholen oder ein Wiedersehen, mit eigener Geste. */
export function patternScript(kit: ScriptKit, topic: LineTopic, item: ShopItem): ScriptDraft {
  const move: WizardGesture = topic === "select.compare" ? "stroke" : "chuckle";
  const text = kit.line(topic, slotsFor(kit.ctx, item));
  return draft("select", 1, [gaze(0, "customer"), gesture(0, move), say(SELECT_LEAD_MS, text)]);
}

/** Wiedersehen mit einem besprochenen Teil: halb so oft ein Satz, sonst nur ein Nicken. */
export function revisitScript(kit: ScriptKit, item: ShopItem): ScriptDraft {
  if (kit.chance(0.5)) return patternScript(kit, "select.revisit", item);
  return browseScript();
}

/** Stellt einen kurzen Satz vor ein Skript, etwa „Ah, Pixel!“ vor die Wahl. */
export function withPrefix(text: string, script: ScriptDraft, at = 0): ScriptDraft {
  const lead = say(at, text);
  const cues = [lead, ...shift(script.cues, sayEnd(lead) + 300)];
  return { ...draft(script.topic, script.priority, cues), lockMs: script.lockMs };
}

/**
 * Eine Wahl hat ihn geweckt: Er schreckt hoch, sagt „Oh! …“ und gleich danach, was er zur Wahl zu
 * sagen hat.
 *
 * @param startled - Ob er schon hochgefahren ist. Dann fehlt nur noch, was er sagt.
 * @param ohAt - Wann das „Oh! …“ kommt.
 */
export function wakeSelectScript(
  kit: ScriptKit,
  select: ScriptDraft,
  startled: boolean,
  ohAt: number,
): ScriptDraft {
  const oh = say(ohAt, kit.line("wake.oh"));
  const startle = [mood(0, "startled"), gesture(0, "startle"), clip(0, "oh"), sfx(0, "snort")];
  // Der Kommentar beginnt 300 ms nach dem „Oh! …“, ohne den Vorlauf einer Wahl.
  const firstWords = select.cues.find((cue) => cue.kind === "say")?.at ?? 0;
  const later = shift(select.cues, sayEnd(oh) + 300 - firstWords);
  return draft("wake", 1, [...(startled ? [] : startle), oh, mood(700, "neutral"), ...later]);
}

/** Das Siegel wird gehalten: Er hebt die Hände zur Kugel und sammelt sich, ohne Worte. */
export function holdScript(): ScriptDraft {
  const cues = [gaze(0, "orb"), mood(0, "focused"), gesture(0, "cast", { seconds: 30 })];
  return draft("hold", 1, cues, { holdMs: CHARGE_MS });
}

/** Losgelassen, bevor es reicht: Er entspannt sich. */
export function releaseScript(): ScriptDraft {
  return draft("release", 1, [mood(0, "neutral"), gaze(0, "viewer")]);
}

/** Das Siegel ist gedrückt: der Zauberspruch. Dauert die Antwort, summt er bei 2,5 s. */
export function commitScript(kit: ScriptKit): ScriptDraft {
  const cues = [
    gaze(0, "orb"),
    mood(0, "focused"),
    gesture(0, "cast", { seconds: 30, keep: true }),
    say(0, kit.line("buy.incantation"), "incantation"),
    clip(2500, "hmm"),
  ];
  return draft("commit", 0, cues, { holdMs: CHARGE_MS });
}

/**
 * Der Kauf als Zauber, ab C: Die geladenen Hände lösen bei `burst` den Zauber, beim Einschlag hüpft
 * das Jelly, dann gratuliert er und schlägt etwas vor. Bis zu den Glückwünschen unterbricht ihn
 * nichts.
 *
 * @param incantation - Ob der Spruch noch fehlt, weil kein `commit` voranging.
 */
export function boughtScript(
  kit: ScriptKit,
  item: ShopItem,
  { burst, impact, congrats }: PurchaseTimeline,
  incantation: boolean,
): ScriptDraft {
  const thanks = say(congrats, kit.line("buy.congrats", slotsFor(kit.ctx, item)));
  const cues: WizardCue[] = [
    gaze(0, "orb"),
    mood(0, "focused"),
    gesture(0, "cast", { keep: true, releaseMs: burst, seconds: congrats / 1000 }),
    effect(burst, "spellBurst", item.cosmetic.id),
    gaze(burst, "customer"),
    customer(impact, "cheer", 2, true),
    gesture(congrats, "rejoice"),
    mood(congrats, "delighted"),
    thanks,
  ];
  if (incantation) cues.push(say(0, kit.line("buy.incantation"), "incantation"));
  const tip = suggestionFor(kit.ctx, item);
  if (tip) {
    const text = kit.line(tip.topic, slotsFor(kit.ctx, tip.item));
    cues.push(say(sayEnd(thanks) + SUGGEST_AFTER_MS, text, "speech", false));
  }
  // Der Vorschlag danach ist beiläufig: Gehalten wird nur bis zum Ende der Glückwünsche.
  return draft("bought", 0, cues, { lockMs: congrats, holdMs: congrats + holdFor(thanks.text) });
}

/** Der Kauf ging schief: Der Zauber verpufft, er zuckt verlegen mit den Schultern. */
export function failedScript(kit: ScriptKit, item: ShopItem | null): ScriptDraft {
  return draft("fizzle", 0, [
    effect(0, "fizzle", item?.cosmetic.id),
    mood(0, "sheepish"),
    gaze(0, "customer"),
    gesture(150, "shrug"),
    say(300, kit.line("buy.fizzle")),
  ]);
}

/** Wie viele Absagen er der Reihe nach gibt, danach wechselt er ab. */
const HAGGLE_STEPS = 4;

/** Das gesperrte Siegel gedrückt: ein Blick zur Börse und eine Absage. Ohne LAN verkauft er nichts. */
export function blockedScript(kit: ScriptKit, item: ShopItem | null, step: number): ScriptDraft {
  const slots = slotsFor(kit.ctx, item);
  let text = kit.line("haggle.closed");
  if (kit.ctx.open !== false) {
    text = step < HAGGLE_STEPS ? kit.lineAt("haggle", step, slots) : kit.line("haggle", slots);
  }
  return draft("haggle", 1, [
    gaze(0, "purse"),
    mood(0, "attentive"),
    gesture(200, step % 2 === 0 ? "shrug" : "nod"),
    say(300, text),
    gaze(700, "viewer"),
  ]);
}

/** Angelegt oder abgelegt. Beim Lob wird das Jelly verlegen. */
export function equippedScript(kit: ScriptKit, item: ShopItem, worn: boolean): ScriptDraft {
  const text = kit.line(worn ? "equip.on" : "equip.off", slotsFor(kit.ctx, item));
  const cues = [gaze(0, "customer"), gesture(0, "nod"), say(250, text)];
  return draft("equip", 1, worn ? [...cues, customer(300, "shy", 1.8)] : cues);
}

/** Lange auf einer Ware verweilt: Er beugt sich vor und sagt etwas dazu. */
export function quipScript(kit: ScriptKit, slots: LineSlots): ScriptDraft {
  const cues = [gaze(0, "ledger"), mood(0, "attentive"), gesture(0, "nod")];
  return draft("quip", 3, [...cues, say(150, kit.line("hover.quip", slots), "speech", false)]);
}

/** Lange über dem Siegel eines bezahlbaren Teils: Er ermuntert und bietet es an. */
export function sealScript(kit: ScriptKit): ScriptDraft {
  const cues = [gaze(0, "seal"), gesture(0, "offer"), say(200, kit.line("seal.encourage"))];
  return draft("seal", 3, cues);
}

/** Lange über der Börse: Er zählt mit. */
export function purseScript(kit: ScriptKit): ScriptDraft {
  const text = kit.line("purse", slotsFor(kit.ctx));
  return draft("purse", 3, [gaze(0, "purse"), say(200, text), gaze(1800, "viewer")]);
}

/** Münzen vom Server: Er zählt sie mit Klimpern, der Orga dankt er, Erstattung nimmt er hin. */
export function coinsScript(kit: ScriptKit, amount: number, source: string): ScriptDraft {
  const slots = { ...slotsFor(kit.ctx), gained: coinLabel(amount) };
  if (source === "admin") {
    return draft("server", 2, [gesture(0, "rejoice"), say(200, kit.line("server.gift", slots))]);
  }
  if (source === "refund") {
    return draft("server", 2, [gesture(0, "shrug"), say(200, kit.line("server.refund", slots))]);
  }
  const taps = Array.from({ length: Math.min(amount, COUNT_TAP.most) }, (_, index) =>
    sfx(COUNT_TAP.firstMs + index * COUNT_TAP.stepMs, "coinClink"),
  );
  return draft("server", 2, [
    gaze(0, "purse"),
    gaze(600, "viewer"),
    gesture(0, "count"),
    effect(0, "purseClink"),
    ...taps,
    say(200, kit.line("server.coins", slots)),
  ]);
}

/** Ein Level-Aufstieg, mit `gained` Münzen dazu: Er jubelt, das Jelly auch. */
export function levelScript(kit: ScriptKit, level: number, gained: number | null): ScriptDraft {
  const slots = { ...slotsFor(kit.ctx), level: String(level) };
  const text =
    gained === null
      ? kit.line("server.level", slots)
      : kit.line("server.levelCoins", { ...slots, gained: coinLabel(gained) });
  const cues = [gesture(0, "rejoice"), mood(0, "delighted"), say(200, text)];
  return draft("server", 2, [...cues, customer(200, "cheer", 2)]);
}

/** Ein Erfolg, der den Laden betrifft. Andere feiert das Pet. */
export function achievementScript(kit: ScriptKit, key: string): ScriptDraft | null {
  if (key === "first-purchase") {
    return draft("server", 2, [gesture(0, "nod"), say(200, kit.line("server.firstPurchase"))]);
  }
  if (key !== "shopaholic") return null;
  return draft("server", 2, [gesture(0, "chuckle"), say(200, kit.line("server.shopaholic"))]);
}

/** Eine Ehrung der Orga: Er zieht den Hut. */
export function awardScript(kit: ScriptKit): ScriptDraft {
  const text = kit.line("server.award", slotsFor(kit.ctx));
  return draft("server", 2, [gesture(0, "tip"), sfx(250, "hatTip"), say(250, text)]);
}

/** Nach dem Neuladen reicht es für `item`: Er zeigt darauf, die Rolle hebt es hervor. */
export function affordableScript(kit: ScriptKit, item: ShopItem): ScriptDraft {
  const spoken = say(200, kit.line("server.affordable", slotsFor(kit.ctx, item)));
  const point = gesture(onName(spoken, item.cosmetic.name), "offer");
  const cues = [gaze(0, "ledger"), effect(0, "highlightItem", item.cosmetic.id), spoken, point];
  return draft("affordable", 2, cues, { polite: true });
}

/** Die LAN beginnt oder endet: Er öffnet oder schließt den Laden. */
export function lanScript(kit: ScriptKit, open: boolean): ScriptDraft {
  const text = kit.line(open ? "lan.open" : "lan.close");
  return draft("lan", 0, [gaze(0, "viewer"), gesture(0, open ? "hail" : "tip"), say(250, text)]);
}

/** Die Leiter beim Stupsen: Kichern, Hut festhalten, Schreck, ernster Blick, Schnauben. */
const POKE_STEPS: readonly WizardCue[][] = [
  [gesture(0, "chuckle"), clip(0, "hoho"), mood(0, "delighted")],
  [gesture(0, "tip"), effect(0, "hatSparkle"), sfx(0, "hatTip")],
  [gesture(0, "startle"), clip(0, "oh"), mood(0, "startled")],
  [gesture(0, "nod"), mood(0, "focused"), gaze(0, "viewer")],
  [gesture(0, "huff"), mood(0, "focused")],
];

/** So viele Stufen hat die Leiter. */
export const POKE_LADDER = POKE_STEPS.length;

/** Stupser Nummer `step` (0 bis 4) in seiner Leiter. */
export function pokeScript(kit: ScriptKit, step: number): ScriptDraft {
  const moves = POKE_STEPS[Math.min(step, POKE_LADDER - 1)] ?? [];
  return draft("poke", 2, [...moves, say(250, kit.lineAt("poke", step)), mood(2400, "neutral")]);
}

/** Nach der Leiter nur noch ein strenger Blick, ohne Worte. */
export function glareScript(): ScriptDraft {
  return draft("poke", 2, [gaze(0, "viewer"), mood(0, "focused"), mood(1500, "neutral")]);
}

/** Wie lange die Leiter ohne Stupser hält und wie lange danach nur ein Blick kommt. */
const POKE_TIMING = { windowMs: 10_000, coolMs: 20_000 } as const;

/** Wie weit er beim Stupsen schon ist. */
export interface PokeLadder {
  step: number;
  at: number;
  coolUntil: number;
}

/** Noch nicht gestupst. */
export const FRESH_LADDER: PokeLadder = { step: 0, at: -Infinity, coolUntil: -Infinity };

/**
 * Ein Stupser: die Leiter hinauf, nach der fünften Stufe 20 s nur ein Blick, nach 10 s Ruhe von
 * vorn.
 */
export function pokeReaction(kit: ScriptKit, ladder: PokeLadder, now: number) {
  if (now < ladder.coolUntil) return { draft: glareScript(), ladder };
  const step = now - ladder.at > POKE_TIMING.windowMs ? 0 : ladder.step;
  const top = step + 1 >= POKE_LADDER;
  const coolUntil = top ? now + POKE_TIMING.coolMs : ladder.coolUntil;
  return { draft: pokeScript(kit, step), ladder: { step: top ? 0 : step + 1, at: now, coolUntil } };
}

/** Aufstieg und Münzen kommen getrennt, er wartet bis `at` auf das andere. */
export interface ServerMerge {
  level?: number;
  coins?: number;
  at: number;
}

/** So lange wartet er auf das zweite Ereignis. */
const MERGE_MS = 1500;

/** Was ein Ereignis vom Server auslöst: ein Skript, Warten auf seinen Partner oder nichts. */
export interface ServerReaction {
  draft: ScriptDraft | null;
  merge: ServerMerge | null;
}

/** Eine Zahl aus dem Inhalt eines Ereignisses. */
function amountOf(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Legt einen Teil zum Wartenden. Sind Aufstieg und Münzen da, sagt er beides auf einmal. */
function mergeWith(
  kit: ScriptKit,
  merge: ServerMerge | null,
  part: Partial<ServerMerge>,
  now: number,
) {
  const next = { ...merge, ...part, at: merge?.at ?? now + MERGE_MS };
  if (next.level === undefined || next.coins === undefined) return { draft: null, merge: next };
  return { draft: levelScript(kit, next.level, next.coins), merge: null };
}

/**
 * Was er zu einem Ereignis vom Server sagt. Münzen von der Orga und Erstattungen gleich, Aufstieg
 * und Münzen dafür zusammen. Unbekannte Ereignisse und Erfolge lässt er still vorbeiziehen.
 */
export function serverReaction(
  kit: ScriptKit,
  event: ServerEvent,
  merge: ServerMerge | null,
  now: number,
): ServerReaction {
  const payload = event.payload ?? {};
  switch (event.type) {
    case "coins.gained": {
      const source = typeof payload.source === "string" ? payload.source : "level";
      const coins = amountOf(payload.amount);
      if (source === "level") return mergeWith(kit, merge, { coins }, now);
      return { draft: coinsScript(kit, coins, source), merge };
    }
    case "level.up":
      return mergeWith(kit, merge, { level: amountOf(payload.level) }, now);
    case "achievement.earned":
      return { draft: achievementScript(kit, String(payload.key ?? "")), merge };
    case "award.given":
      return { draft: awardScript(kit), merge };
    default:
      return { draft: null, merge };
  }
}

/** Sagt, was vom Server noch auf seinen Partner wartet. */
export function flushServer(kit: ScriptKit, merge: ServerMerge): ScriptDraft {
  if (merge.level === undefined) return coinsScript(kit, merge.coins ?? 0, "level");
  return levelScript(kit, merge.level, merge.coins ?? null);
}
