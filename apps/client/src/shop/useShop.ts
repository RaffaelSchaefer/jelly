/**
 * Stand, Katalog und Aktionen des Shop-Fensters.
 *
 * Es hört wie das Pet auf die Ereignisse zum eigenen Jelly und liest danach neu: Münzen kommen auch
 * von der Orga, und ein Kauf bringt Erfolge. In der Browser-Vorschau gibt es kein Backend, Kaufen
 * und Anlegen ändern dann nur den lokalen Stand.
 *
 * @module
 */

import { useCallback, useEffect, useState } from "react";

import * as backend from "../backend";
import { desktop } from "../backend";
import { equipColor, withEquipped, type CosmeticSlot, type ShopItem } from "../pet";
import {
  inRunningLan,
  useBackendCall,
  useGameState,
  useServerEvents,
  useStreamReset,
} from "../useGame";

/** Der Kauf in der Vorschau: Die Münzen gehen weg, das Teil gehört dem Jelly. */
function usePreviewPurchase(patchGame: ReturnType<typeof useGameState>["patchGame"]) {
  return useCallback(
    (item: ShopItem) =>
      patchGame((current) => ({
        ...current,
        me: current.me && {
          ...current.me,
          coins: current.me.coins - item.price,
          cosmetics: [...current.me.cosmetics, item.cosmetic.id],
        },
      })),
    [patchGame],
  );
}

/** Lädt Stand und Katalog und hält beide aktuell. */
function useShopData() {
  const state = useGameState();
  const { setGame, setCatalog, reload } = state;
  const call = useBackendCall(reload);
  const { run } = call;
  const [ready, setReady] = useState(!desktop);

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

/** Alles, was das Shop-Fenster zeigt und tut. */
export function useShop() {
  const data = useShopData();
  const { game, catalog, setGame, patchGame, run, ready } = data;
  const previewPurchase = usePreviewPurchase(patchGame);
  // Mit Zähler: Jeder Kauf ist ein neuer Hüpfer.
  const [pulse, setPulse] = useState(0);

  /** Kauft ein Teil. `true`, wenn es geklappt hat. */
  const purchase = useCallback(
    async (item: ShopItem) => {
      if (!desktop) previewPurchase(item);
      else {
        const next = await run(() => backend.purchaseCosmetic(item.cosmetic.id));
        if (!next) return false;
        setGame(next);
      }
      setPulse((value) => value + 1);
      return true;
    },
    [previewPurchase, run, setGame],
  );

  /** Legt ein Teil auf seinen Platz oder leert den Platz mit `null`. `true`, wenn es geklappt hat. */
  const equip = useCallback(
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

  return { ...data, pulse, purchase, equip, open: inRunningLan(game, ready) };
}

/** Alles, was {@link useShop} liefert. */
export type ShopControls = ReturnType<typeof useShop>;
