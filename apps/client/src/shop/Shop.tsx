/**
 * Das Shop-Fenster als Zauberladen: oben Messingschild und Börse, darunter die Ladentheke mit dem
 * Zauberer und dem eigenen Jelly zur Anprobe, unten die Rolle mit den Waren und der Kaufbrief mit
 * seinem Siegel.
 *
 * Wählen probiert eine Ware an (`useShopMoments.ts`), erst das Siegel kauft sie oder legt sie an
 * (`useSealRitual.ts`). Beide lenken Funken, Klang, Licht, Runen, Börse und Zauberer im Takt aus
 * `pet/shopTimeline.ts`. Preise und Kauf entscheidet der Server, `pet/shop.ts` rechnet nur aus, was
 * dasteht. Den Klang des Fensters hält `useShopSound`.
 *
 * @module
 */

import { useEffect, useMemo, useState } from "react";

import type { WindowAction } from "../backend";

import { desktop } from "../backend";
import {
  equipColor,
  shopItems,
  withEquipped,
  type Catalog,
  type Equipped,
  type Me,
  type ShopItem,
} from "../pet";
import { OS_REDUCED_MOTION, useDocumentTheme } from "../useDocumentTheme";
import { useClickSounds } from "../useUiSounds";
import ShopHeader from "./ShopHeader";
import ShopLedger from "./ShopLedger";
import ShopNotice from "./ShopNotice";
import ShopSeal from "./ShopSeal";
import ShopStage from "./ShopStage";
import { NoJellyLetter, ShopSkeleton } from "./ShopStates";
import { shopSound } from "./sound/shopSound";
import { useShopSound } from "./sound/useShopSound";
import { useSealRitual, type PurseHold } from "./useSealRitual";
import { useShop, type ShopControls } from "./useShop";
import { useShopMoments } from "./useShopMoments";
import { useStageCues } from "./useStageCues";
import { useWizard, type WizardWorld } from "./useWizard";

/** Was das Jelly zur Probe trägt: alles wie bisher und dazu die gewählte Ware. */
function tryOn(me: Me, item: ShopItem | null, catalog: Catalog): Equipped {
  if (!item) return me.equipped;
  const { id, slot } = item.cosmetic;
  return withEquipped(me.equipped, slot, id, equipColor(id, catalog));
}

/** Was der Zauberer über den Laden weiß. */
function useWorld(shop: ShopControls, me: Me, items: readonly ShopItem[]): WizardWorld {
  const { coins_per_level: perLevel, xp_per_level: xpPerLevel } = shop.game.lan.rules;
  const { open } = shop;
  return useMemo(
    () => ({ me, items, open, perLevel, xpPerLevel }),
    [me, items, open, perLevel, xpPerLevel],
  );
}

/** Was der Laden über ein laufendes Ritual nach außen gibt: Börse und Zeremonie des Siegels. */
interface RitualHooks {
  onPurseHold: PurseHold;
  /** Ob das Siegel gerade stempelt oder trocknet. So lange gehört ein Fehler ihm. */
  onSealBusy: (busy: boolean) => void;
}

/** Theke, Rolle und Kaufbrief. */
function ShopBody({ shop, me, ritual }: { shop: ShopControls; me: Me; ritual: RitualHooks }) {
  const { onPurseHold, onSealBusy } = ritual;
  const { catalog } = shop;
  const items = useMemo(() => shopItems(catalog, me), [catalog, me]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [keep, setKeep] = useState<string | null>(null);
  const selected = items.find((item) => item.cosmetic.id === chosen) ?? null;
  const equipped = useMemo(() => tryOn(me, selected, catalog), [me, selected, catalog]);
  const wizard = useWizard(shop.game.settings, useWorld(shop, me, items));
  const { notice } = wizard;
  const { cues, director } = useStageCues();
  useShopMoments({ selected, me, notice, director });
  const calm = shop.game.settings.reducedMotion ?? OS_REDUCED_MOTION;
  const seal = useSealRitual({ me, calm, notice, director, onPurseHold, onBought: setKeep });
  // Solange das Wachs nicht sitzt, bleibt die Wahl: Sonst stünde die Quittung bei der falschen Ware.
  const frozen = seal.phase === "stamping" || seal.phase === "setting";
  useEffect(() => () => onPurseHold(null), [onPurseHold]);
  useEffect(() => {
    onSealBusy(frozen);
    return () => onSealBusy(false);
  }, [frozen, onSealBusy]);

  function choose(item: ShopItem | null) {
    if (frozen) return;
    const id = item?.cosmetic.id ?? null;
    setChosen(id);
    setKeep((kept) => (kept === id ? kept : null));
    shop.clearError();
  }

  return (
    <>
      <ShopStage {...{ shop, wizard, me, equipped }} {...cues} />
      <ShopLedger
        {...{ items, me, catalog, frozen }}
        chosenId={chosen}
        keepId={keep}
        open={shop.open}
        onChoose={choose}
      />
      <ShopSeal
        {...{ shop, wizard, me }}
        item={selected}
        onPhase={seal.onPhase}
        onDismiss={() => choose(null)}
      />
    </>
  );
}

/**
 * Was unter dem Kopf steht. Bis Rust geantwortet hat, nur das Gerüst: Vorher hielte der Stand noch
 * die Beispieldaten der Vorschau.
 */
function ShopContent({
  shop,
  me,
  ritual,
}: {
  shop: ShopControls;
  me: Me | null;
  ritual: RitualHooks;
}) {
  if (!shop.ready) return <ShopSkeleton />;
  if (!me) {
    return <NoJellyLetter onLeave={desktop ? () => void shop.windowAction("close") : undefined} />;
  }
  return <ShopBody shop={shop} me={me} ritual={ritual} />;
}

/** Das ganze Fenster. */
export default function Shop() {
  const shop = useShop();
  const { settings, lan } = shop.game;
  const me = shop.ready ? shop.game.me : null;
  const [hold, setHold] = useState<number | null>(null);
  const [sealBusy, setSealBusy] = useState(false);
  const ritual = useMemo(() => ({ onPurseHold: setHold, onSealBusy: setSealBusy }), []);
  useDocumentTheme(
    me?.color ?? "mint",
    settings.reducedMotion ?? OS_REDUCED_MOTION,
    settings.optimizedRendering,
  );
  // Scheitert ein Kauf, verpufft es erst, wenn das Wachs springt (`useSealRitual.ts`), nicht schon
  // mitten im Stempel.
  useClickSounds(settings, sealBusy ? "" : shop.error);
  useShopSound(settings);
  // Schließen blendet den Klang erst aus: So knackt nichts, wenn das Fenster zugeht.
  const onWindow = (action: WindowAction) =>
    action === "close"
      ? shopSound.closeThen(() => void shop.windowAction(action))
      : void shop.windowAction(action);
  const purse = me
    ? { coins: me.coins, perLevel: lan.rules.coins_per_level, open: shop.open, hold }
    : null;
  return (
    <main
      className="shop"
      aria-labelledby="shop-title"
      aria-busy={!shop.ready}
      data-open={shop.open}
    >
      <ShopHeader purse={purse} onWindow={onWindow} />
      <ShopContent shop={shop} me={me} ritual={ritual} />
      {/* Solange das Siegel stempelt, hält die Börse die alten Münzen. So lange wartet auch der
          Zettel: Erst springt das Wachs, dann kommt die Meldung des Servers. */}
      {shop.error && hold === null ? (
        <ShopNotice
          message={shop.error}
          onRetry={shop.ready ? undefined : () => void shop.load()}
          onClose={shop.clearError}
        />
      ) : null}
      <div className="shop-frame" aria-hidden="true" />
    </main>
  );
}
