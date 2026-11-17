/**
 * Stand, Katalog und Aktionen des Shop-Fensters.
 *
 * Es hört wie das Pet auf die Ereignisse zum eigenen Jelly und liest danach neu: Münzen kommen auch
 * von der Orga, und ein Kauf bringt Erfolge. In der Browser-Vorschau gibt es kein Backend. Kaufen
 * und Anlegen ändern dann nur den lokalen Stand, und Hashes wie `#shop-fehler` spielen den Server
 * (`pet/preview.ts`).
 *
 * @module
 */

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import * as backend from "../backend";
import { desktop } from "../backend";
import {
  equipColor,
  previewCoinGift,
  previewSettings,
  previewShop,
  withEquipped,
  type CosmeticSlot,
  type Game,
  type ShopItem,
} from "../pet";
import {
  inRunningLan,
  useBackendCall,
  useGameState,
  useServerEvents,
  useStreamReset,
} from "../useGame";

/** Wie sich der Laden in der Vorschau verhält, nach dem Hash beim Öffnen des Fensters. */
const PREVIEW = previewShop(desktop ? "" : location.hash);

/** Antwortet in der Vorschau wie ein Server: nach einer Weile, und mit `#shop-fehler` ablehnend. */
function previewAnswer() {
  return new Promise<true>((resolve, reject) => {
    window.setTimeout(() => {
      // Wie aus Rust: Fehler kommen dort als Text.
      if (PREVIEW.purchaseError) reject(PREVIEW.purchaseError);
      else resolve(true);
    }, PREVIEW.purchaseMs);
  });
}

/** Der Kauf in der Vorschau: Die Münzen gehen weg, die Ware gehört dem Jelly. */
function previewBought(item: ShopItem) {
  return (game: Game): Game => ({
    ...game,
    me: game.me && {
      ...game.me,
      coins: game.me.coins - item.price,
      cosmetics: [...game.me.cosmetics, item.cosmetic.id],
    },
  });
}

/** Die Vorschau: Einstellungen aus der Adresse und der Level-Aufstieg von `#shop-muenzen`. */
function usePreviewWorld(patchGame: ReturnType<typeof useGameState>["patchGame"]) {
  // Vor dem ersten Bild, sonst flackerte etwa `?ruhig` einmal mit Bewegung auf.
  useLayoutEffect(() => {
    if (desktop || !location.search) return;
    patchGame((game) => ({ ...game, settings: previewSettings(location.search, game.settings) }));
  }, [patchGame]);

  useEffect(() => {
    const { giftMs } = PREVIEW;
    if (desktop || giftMs === null) return;
    const timer = window.setTimeout(() => patchGame(previewCoinGift), giftMs);
    return () => window.clearTimeout(timer);
  }, [patchGame]);
}

/** Lädt Stand und Katalog und hält beide aktuell. */
function useShopData() {
  const state = useGameState();
  const { setGame, setCatalog, reload, patchGame } = state;
  const call = useBackendCall(reload);
  const { run } = call;
  const [ready, setReady] = useState(!desktop && PREVIEW.ready);
  usePreviewWorld(patchGame);

  /** Lädt alles. Auch für „Erneut versuchen“, falls das Laden scheitert. */
  const load = useCallback(async () => {
    if (!desktop) return;
    const loaded = await run(() => Promise.all([backend.getGame(), backend.getCatalog()]), false);
    if (!loaded) return;
    setGame(loaded[0]);
    setCatalog(loaded[1]);
    setReady(true);
  }, [run, setGame, setCatalog]);
  useEffect(() => void load(), [load]);

  const onEvent = useCallback(() => void reload(), [reload]);
  useServerEvents(desktop && ready, onEvent);
  useStreamReset(desktop && ready, reload);
  return { ...state, ...call, ready, load };
}

/** Was {@link useShopData} liefert. */
type ShopData = ReturnType<typeof useShopData>;

/** Legt Waren an und ab. */
function useEquip({ catalog, patchGame, run, setGame }: ShopData) {
  /** Legt eine Ware auf ihren Platz oder leert ihn mit `null`. `true`, wenn es geklappt hat. */
  return useCallback(
    async (slot: CosmeticSlot, key: string | null) => {
      const color = equipColor(key, catalog);
      if (!desktop) {
        patchGame((current) => ({
          ...current,
          me: current.me && {
            ...current.me,
            equipped: withEquipped(current.me.equipped, slot, key, color),
          },
        }));
        return true;
      }
      const next = await run(() => backend.equipCosmetic(slot, key, color));
      if (!next) return false;
      setGame(next);
      return true;
    },
    [catalog, patchGame, run, setGame],
  );
}

/** Kauft Waren. Jeder Kauf zählt `pulse` hoch: Das Jelly hüpft vor Freude. */
function usePurchase({ patchGame, run, setGame }: ShopData) {
  const [pulse, setPulse] = useState(0);

  /** Kauft eine Ware. `true`, wenn der Server zugestimmt hat. */
  const purchase = useCallback(
    async (item: ShopItem) => {
      const next = await run<Game | true>(() =>
        desktop ? backend.purchaseCosmetic(item.cosmetic.id) : previewAnswer(),
      );
      if (!next) return false;
      if (next === true) patchGame(previewBought(item));
      else setGame(next);
      setPulse((value) => value + 1);
      return true;
    },
    [patchGame, run, setGame],
  );
  return { pulse, purchase };
}

/** Alles, was das Shop-Fenster zeigt und tut. */
export function useShop() {
  const data = useShopData();
  const { game, ready } = data;
  const { pulse, purchase } = usePurchase(data);
  const equip = useEquip(data);

  /**
   * Kauft eine Ware und behält sie an: Das Jelly trägt sie zur Probe schon. `true`, wenn der Kauf
   * geklappt hat, auch wenn das Anlegen danach scheitert. Dann steht der Fehler da, und das Siegel
   * bietet „Anlegen“ an.
   */
  const purchaseAndWear = useCallback(
    async (item: ShopItem) => {
      if (!(await purchase(item))) return false;
      await equip(item.cosmetic.slot, item.cosmetic.id);
      return true;
    },
    [purchase, equip],
  );

  // In der Vorschau zeigt erst `#shop-zu` den geschlossenen Laden.
  const open = desktop ? inRunningLan(game, ready) : game.lan.current !== null;
  return { ...data, pulse, purchase, purchaseAndWear, equip, open };
}

/** Alles, was {@link useShop} liefert. */
export type ShopControls = ReturnType<typeof useShop>;
