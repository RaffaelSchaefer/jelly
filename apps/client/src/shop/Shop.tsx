/**
 * Das Shop-Fenster als Zauberladen: oben die Ladentheke mit dem Zauberer und dem eigenen Jelly zur
 * Anprobe, darunter die Pergament-Rolle mit den Waren und das Siegel zum Kaufen.
 *
 * Wählen probiert ein Teil an, erst das Siegel kauft oder legt es an. Preise und Kauf entscheidet
 * der Server, `pet/shop.ts` rechnet nur aus, was dasteht.
 *
 * @module
 */

import { useEffect, useRef, useState } from "react";

import {
  equipColor,
  shopItems,
  withEquipped,
  type Catalog,
  type Equipped,
  type Me,
  type ShopItem,
} from "../pet";
import { ErrorAlert } from "../ui";
import { OS_REDUCED_MOTION, useDocumentTheme } from "../useDocumentTheme";
import { useClickSounds } from "../useUiSounds";
import { WindowTools } from "../WindowChrome";
import ShopLedger, { isWorn } from "./ShopLedger";
import ShopSeal from "./ShopSeal";
import ShopStage from "./ShopStage";
import { useShop, type ShopControls } from "./useShop";
import { useWizard, type WizardControls } from "./useWizard";

/** Was das Jelly zur Probe trägt: alles wie bisher und dazu das gewählte Teil. */
function tryOn(me: Me, item: ShopItem | null, catalog: Catalog): Equipped {
  if (!item) return me.equipped;
  const { id, slot } = item.cosmetic;
  return withEquipped(me.equipped, slot, id, equipColor(id, catalog));
}

/** Der Zauberer begrüßt einmal je Fenster. Der Ref hält auch den doppelten Effekt im StrictMode ab. */
function useGreeting(say: WizardControls["say"], name: string) {
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    say({ kind: "greet", name });
  }, [say, name]);
}

/** Theke, Rolle und Siegel. */
function ShopBody({ shop, me }: { shop: ShopControls; me: Me }) {
  const { catalog } = shop;
  const items = shopItems(catalog, me);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = items.find((item) => item.cosmetic.id === chosen) ?? null;
  const wizard = useWizard(shop.game.settings);
  useGreeting(wizard.say, me.name);

  function choose(item: ShopItem) {
    setChosen(item.cosmetic.id);
    shop.clearError();
    wizard.say({ kind: "select", item, worn: isWorn(me, item), open: shop.open });
  }

  return (
    <>
      <ShopStage {...{ shop, wizard, me }} equipped={tryOn(me, selected, catalog)} />
      <ShopLedger {...{ items, me, catalog }} chosen={selected} onChoose={choose} />
      <ShopSeal {...{ shop, wizard, me }} item={selected} />
    </>
  );
}

/**
 * Was unter dem Titel steht. Bis Rust geantwortet hat, nur ein Hinweis: Vorher hielte der Stand
 * noch die Beispieldaten der Vorschau.
 */
function ShopContent({ shop, me }: { shop: ShopControls; me: Me | null }) {
  if (!shop.ready) {
    return (
      <p className="shop-empty" role="status">
        Der Laden öffnet …
      </p>
    );
  }
  if (!me) {
    return (
      <p className="shop-empty">
        Ohne Jelly gibt es nichts anzuprobieren. Löse erst einen Code ein.
      </p>
    );
  }
  return <ShopBody shop={shop} me={me} />;
}

/** Das ganze Fenster. */
export default function Shop() {
  const shop = useShop();
  const { settings } = shop.game;
  const me = shop.ready ? shop.game.me : null;
  useDocumentTheme(
    me?.color ?? "mint",
    settings.reducedMotion ?? OS_REDUCED_MOTION,
    settings.optimizedRendering,
  );
  useClickSounds(settings, shop.error);
  return (
    <main className="shop" aria-labelledby="shop-title">
      <WindowTools
        name="Zauberladen"
        quietClose
        onAction={(action) => void shop.windowAction(action)}
      />
      <h1 id="shop-title" className="shop-title">
        Zauberladen
      </h1>
      <ShopContent shop={shop} me={me} />
      {shop.error ? (
        <ErrorAlert
          message={shop.error}
          onRetry={shop.ready ? undefined : () => void shop.load()}
        />
      ) : null}
    </main>
  );
}
