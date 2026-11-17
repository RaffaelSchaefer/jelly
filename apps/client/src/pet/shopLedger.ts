/**
 * Die Rolle des Zauberladens als reine Rechnung: in welcher Reihenfolge die Waren stehen, wohin die
 * Pfeiltasten führen und was der leere Kaufbrief über den Laden sagt.
 *
 * Gezeigt wird sie in `shop/ShopLedger.tsx` und `shop/ShopSeal.tsx`.
 *
 * @module
 */

import type { ShopItem } from "./shop";
import type { Catalog, Me } from "./types";

import { coinLabel, COSMETICS } from "./cosmetics";
import { wareAccusative } from "./shopLore";

/** Die Rolle: oben, was man kaufen kann, darunter, was schon in der Truhe liegt. */
export interface LedgerView {
  /** Erst kaufbar nach Preis, dann zu teuer nach fehlenden Münzen. */
  wares: ShopItem[];
  /** Was dem Jelly gehört: Angelegtes zuerst, dann nach Platz und Name. */
  chest: ShopItem[];
}

/** Die Plätze in der Truhe in der Reihenfolge, in der ein Jelly sie anzieht. */
const SLOT_ORDER = ["head", "face", "hands", "body", "aura"];

/** Ob `me` die Ware gerade trägt. */
export function isWorn(me: Pick<Me, "equipped">, item: ShopItem) {
  return me.equipped[item.cosmetic.slot]?.key === item.cosmetic.id;
}

/** Nach Namen, wie im Deutschen sortiert. */
function byName(a: ShopItem, b: ShopItem) {
  return a.cosmetic.name.localeCompare(b.cosmetic.name, "de");
}

/**
 * Oben in der Rolle nach Preis. Das stellt Kaufbares vor zu Teures und ordnet zu Teures nach den
 * fehlenden Münzen, denn kaufbar heißt: Der Preis ist höchstens so hoch wie die Münzen. Und die
 * eben gekaufte Ware bleibt genau an ihrem Platz.
 */
function compareWares(a: ShopItem, b: ShopItem) {
  return a.price - b.price || byName(a, b);
}

/** Rang eines Platzes, Unbekanntes ans Ende. */
function slotRank(slot: string) {
  const rank = SLOT_ORDER.indexOf(slot);
  return rank < 0 ? SLOT_ORDER.length : rank;
}

/**
 * Die Rolle für `items`.
 *
 * @param keepId - Die eben gekaufte Ware. Sie bleibt an ihrem Platz oben, bis eine andere gewählt
 *   wird, und rutscht erst dann in die Truhe.
 */
export function ledgerView(
  items: readonly ShopItem[],
  me: Pick<Me, "equipped">,
  keepId: string | null = null,
): LedgerView {
  const onTop = (item: ShopItem) => item.state !== "owned" || item.cosmetic.id === keepId;
  const wares = items.filter(onTop).sort(compareWares);
  const chest = items
    .filter((item) => !onTop(item))
    .sort(
      (a, b) =>
        Number(isWorn(me, b)) - Number(isWorn(me, a)) ||
        slotRank(a.cosmetic.slot) - slotRank(b.cosmetic.slot) ||
        byName(a, b),
    );
  return { wares, chest };
}

/** Die ganze Rolle von oben nach unten, so wie die Pfeiltasten sie gehen. */
export function ledgerOrder(view: LedgerView): ShopItem[] {
  return [...view.wares, ...view.chest];
}

/** Eine Zeile der Rolle: wo sie in der ganzen Reihenfolge beginnt und wie viele Waren sie zeigt. */
interface LedgerRow {
  start: number;
  length: number;
}

/**
 * Die Zeilen der Rolle bei `columns` Spalten. Jeder Abschnitt beginnt in einer neuen Zeile, denn
 * „In deiner Truhe“ steht als eigene Zeile dazwischen.
 */
function ledgerRows(sections: readonly number[], columns: number): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let start = 0;
  for (const size of sections) {
    for (let offset = 0; offset < size; offset += columns) {
      rows.push({ start: start + offset, length: Math.min(columns, size - offset) });
    }
    start += size;
  }
  return rows;
}

/**
 * Eine Zeile höher (`delta` −1) oder tiefer (1), in derselben Spalte. Ist die Zeile dort kürzer,
 * führt die Taste zu ihrer letzten Ware. −1, wenn es keine Zeile mehr gibt.
 */
function verticalStep(index: number, rows: readonly LedgerRow[], delta: number) {
  const row = rows.findIndex((each) => index < each.start + each.length);
  const from = rows[row];
  const to = rows[row + delta];
  if (!from || !to) return -1;
  return to.start + Math.min(index - from.start, to.length - 1);
}

/** Wohin eine Taste führt, von `index` aus, bei diesen Zeilen und `count` Waren. */
const MOVES: Readonly<
  Record<string, (index: number, rows: readonly LedgerRow[], count: number) => number>
> = {
  ArrowLeft: (index) => index - 1,
  ArrowRight: (index) => index + 1,
  ArrowUp: (index, rows) => verticalStep(index, rows, -1),
  ArrowDown: (index, rows) => verticalStep(index, rows, 1),
  Home: () => 0,
  End: (_index, _rows, count) => count - 1,
};

/** Ob `key` eine Taste ist, mit der man durch die Rolle geht. */
export function isLedgerKey(key: string) {
  return Object.hasOwn(MOVES, key);
}

/**
 * Wohin `key` von `index` aus führt, in einer Rolle in `columns` Spalten. `null`, wenn es dort
 * nicht weitergeht: Die Rolle springt nicht im Kreis. Ohne Ware im Fokus (`index` −1) führt jede
 * Taste zur ersten.
 *
 * @param sections - Wie viele Waren jeder Abschnitt der Rolle hat, von oben nach unten: erst die
 *   zum Kaufen, dann die in der Truhe. Jeder beginnt in einer neuen Zeile.
 */
export function ledgerStep(
  index: number,
  key: string,
  sections: readonly number[],
  columns: number,
): number | null {
  const count = sections.reduce((sum, size) => sum + size, 0);
  if (!isLedgerKey(key) || count === 0) return null;
  if (index < 0) return 0;
  const next = MOVES[key](index, ledgerRows(sections, Math.max(1, columns)), count);
  return next >= 0 && next < count ? next : null;
}

/** Eine Anzahl Waren in Worten: „eine Ware“, „2 Waren“. */
function waresLabel(count: number) {
  return count === 1 ? "eine Ware" : `${count} Waren`;
}

/** Was dem Jelly zur günstigsten Ware fehlt, die es sich noch nicht leisten kann. */
function shortLine(short: readonly ShopItem[]) {
  const next = short.reduce((best, item) => (item.missing < best.missing ? item : best));
  const ware = wareAccusative(next.cosmetic.id, next.cosmetic.name) ?? "deine nächste Ware";
  const verb = next.missing === 1 ? "fehlt" : "fehlen";
  return `Für ${ware} ${verb} dir noch ${coinLabel(next.missing)}.`;
}

/**
 * Was der leere Kaufbrief über den Laden sagt: ob er ruht, ob schon alles gekauft ist, was das
 * Jelly sich leisten kann oder was ihm noch fehlt.
 */
export function shopSummary(items: readonly ShopItem[], coins: number, open: boolean): string {
  if (items.length === 0) return "Die Regale sind leer.";
  if (!open) return "Der Laden ruht. Anprobieren kannst du trotzdem.";
  const affordable = items.filter((item) => item.state === "affordable").length;
  const short = items.filter((item) => item.state === "short");
  if (affordable > 0) {
    return `Mit ${coinLabel(coins)} kannst du dir ${waresLabel(affordable)} leisten.`;
  }
  if (short.length === 0) return "Du hast alles! Der Zauberer muss nachzaubern.";
  return shortLine(short);
}

/**
 * Der Name dessen, was die Ware ersetzt: was `me` gerade auf ihrem Platz trägt, wenn es etwas
 * anderes ist. Sonst `null`.
 */
export function replacedItem(me: Pick<Me, "equipped">, item: ShopItem, catalog: Catalog) {
  const worn = me.equipped[item.cosmetic.slot]?.key;
  if (!worn || worn === item.cosmetic.id) return null;
  const known = COSMETICS.find((cosmetic) => cosmetic.id === worn);
  return known?.name ?? catalog.cosmetics.find((entry) => entry.key === worn)?.name ?? worn;
}
