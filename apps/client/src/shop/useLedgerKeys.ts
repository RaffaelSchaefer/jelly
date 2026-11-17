/**
 * Die Tastatur auf der Rolle: Sie ist ein einziger Tab-Halt, die Pfeiltasten wählen und probieren
 * sofort an, Enter und Leertaste springen zum Siegel, Escape legt die Anprobe ab. Steht der Fokus
 * auf einer Ware, die noch nicht gewählt ist, etwa nach Tab auf die Rolle, wählt jede dieser Tasten
 * sie zuerst. Wohin eine Taste führt, rechnet `pet/shopLedger.ts`.
 *
 * @module
 */

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";

import type { ShopItem } from "../pet";

import { isLedgerKey, ledgerStep } from "../pet/shopLedger";
import { uiSounds } from "../uiSound";

/**
 * Hält man eine Pfeiltaste, probiert das Jelly erst an, wenn sie so lange ruht. Sonst entstünden
 * die Sticker dreißigmal in der Sekunde neu.
 */
const REPEAT_TRY_ON_MS = 90;

/** Was die Tastatur der Rolle braucht. */
export interface LedgerKeysOptions {
  /** Die Waren von oben nach unten. */
  order: readonly ShopItem[];
  /** Wie viele Waren jeder Abschnitt hat: erst die zum Kaufen, dann die in der Truhe. */
  sections: readonly number[];
  /** Solange das Siegel stempelt, bleibt die Wahl, wie sie ist. */
  frozen: boolean;
  /** Wählt eine Ware, `null` legt die Anprobe ab. */
  onChoose: (item: ShopItem | null) => void;
}

/** Wie viele Spalten die Rolle gerade zeigt, aus ihrem Raster. */
function columnsOf(list: HTMLElement | null) {
  if (!list) return 1;
  return getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
}

/** Die Option, in der ein Ereignis geschah. */
function optionOf(target: EventTarget) {
  return target instanceof Element ? target.closest<HTMLElement>('[role="option"]') : null;
}

/** Holt eine Ware ins Bild und gibt ihr den Fokus. */
function focusWare(list: HTMLElement | null, item: ShopItem) {
  const option = list?.querySelector<HTMLElement>(`#${CSS.escape(`ware-${item.cosmetic.id}`)}`);
  option?.focus({ preventScroll: true });
  option?.scrollIntoView({ block: "nearest" });
}

/**
 * Die Tastatur der Rolle.
 *
 * @returns `listRef` gehört an die Liste, `onKeyDown` an dieselbe.
 */
export function useLedgerKeys(options: LedgerKeysOptions) {
  const listRef = useRef<HTMLUListElement>(null);
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const repeat = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(repeat.current), []);

  /** Wählt eine Ware. Beim Halten einer Taste erst, wenn sie ruht. */
  function choose(item: ShopItem, held: boolean) {
    window.clearTimeout(repeat.current);
    // Die Anprobe klingt selbst (`useShopMoments.ts`).
    const pick = () => latest.current.onChoose(item);
    if (held) repeat.current = window.setTimeout(pick, REPEAT_TRY_ON_MS);
    else pick();
  }

  /**
   * Enter und Leertaste springen zum Siegel, Escape legt ab. `true`, wenn die Taste dazu gehört.
   *
   * @param unchosen - Die Ware im Fokus, solange sie nicht gewählt ist: Dann wählt Enter sie erst.
   */
  function jump(event: KeyboardEvent<HTMLUListElement>, unchosen: ShopItem | null) {
    if (event.key === "Enter" || event.key === " ") {
      if (unchosen) choose(unchosen, false);
      else document.getElementById("shop-seal")?.focus();
    } else if (event.key === "Escape") {
      window.clearTimeout(repeat.current);
      latest.current.onChoose(null);
    } else return false;
    event.preventDefault();
    return true;
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const { order, sections, frozen } = latest.current;
    const option = optionOf(event.target);
    if (!option) return;
    const index = order.findIndex((item) => item.cosmetic.id === option.dataset.itemId);
    const chosen = option.getAttribute("aria-selected") === "true";
    const unchosen = chosen || frozen ? null : (order[index] ?? null);
    if (jump(event, unchosen) || !isLedgerKey(event.key)) return;
    event.preventDefault();
    const next = frozen ? null : ledgerStep(index, event.key, sections, columnsOf(listRef.current));
    // Am Ende klopft es einmal, nicht bei jeder Wiederholung der gehaltenen Taste.
    if (next === null) {
      if (!event.repeat) uiSounds.play("blocked");
    } else if (next !== index || !chosen) {
      focusWare(listRef.current, order[next]);
      choose(order[next], event.repeat);
    }
  }

  return { listRef, onKeyDown };
}
