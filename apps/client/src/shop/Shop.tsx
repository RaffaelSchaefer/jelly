/**
 * Das Shop-Fenster: Münzstand, die Cosmetics mit Preis und eine Anprobe am eigenen Jelly.
 *
 * Wählen probiert ein Teil an, erst der Knopf darunter kauft oder legt es an. Preise und Kauf
 * entscheidet der Server, `pet/shop.ts` rechnet nur aus, was dasteht.
 *
 * @module
 */

import { lazy, Suspense, useState } from "react";

import {
  coinLabel,
  equipColor,
  FULL_RENDERING,
  OPTIMIZED_RENDERING,
  shopItems,
  slotLabel,
  withEquipped,
  type Catalog,
  type Equipped,
  type Me,
  type Settings,
  type ShopItem,
} from "../pet";
import { ErrorAlert, Icon } from "../ui";
import { OS_REDUCED_MOTION, useDocumentTheme } from "../useDocumentTheme";
import { useClickSounds } from "../useUiSounds";
import { WindowTools } from "../WindowChrome";
import ShopAction from "./ShopAction";
import { useShop, type ShopControls } from "./useShop";

/** Three.js erst laden, wenn die Liste schon dasteht. */
const PetScene = lazy(() => import("../scene/PetScene"));

/** Was statt des Jellys dasteht, solange Three.js lädt. */
const WAKING_UP = <span className="render-fallback">Dein Begleiter kommt …</span>;

/** Was das Jelly zur Probe trägt: alles wie bisher und dazu das gewählte Teil. */
function tryOn(me: Me, item: ShopItem | null, catalog: Catalog): Equipped {
  if (!item) return me.equipped;
  const { id, slot } = item.cosmetic;
  return withEquipped(me.equipped, slot, id, equipColor(id, catalog));
}

/** Das Jelly mit der Anprobe. Ohne Glas: Im Shop gibt es keine Tropfen am Jelly. */
function TryOn({
  me,
  equipped,
  pulse,
  settings,
}: {
  me: Me;
  equipped: Equipped;
  pulse: number;
  settings: Settings;
}) {
  const profile = settings.optimizedRendering ? OPTIMIZED_RENDERING : FULL_RENDERING;
  return (
    <div className="shop-jelly">
      <Suspense fallback={WAKING_UP}>
        <PetScene
          {...{ equipped, pulse }}
          color={me.color}
          reducedMotion={settings.reducedMotion ?? OS_REDUCED_MOTION}
          rendering={{ ...profile, glass: false }}
          frameLimit={settings.frameLimit}
        />
      </Suspense>
    </div>
  );
}

/** Was rechts in einer Zeile steht: der Preis, oder dass es schon da ist. */
function RowState({ item, worn }: { item: ShopItem; worn: boolean }) {
  if (item.state === "owned")
    return <span className="shop-owned">{worn ? "Angelegt" : "Gekauft"}</span>;
  return (
    <span className="shop-price" aria-label={coinLabel(item.price)}>
      <Icon name="coin" />
      {item.price}
    </span>
  );
}

/** Eine Zeile der Liste. Ein Klick probiert das Teil an. */
function ShopRow({
  item,
  me,
  catalog,
  selected,
  onSelect,
}: {
  item: ShopItem;
  me: Me;
  catalog: Catalog;
  selected: boolean;
  onSelect: () => void;
}) {
  const { cosmetic } = item;
  const worn = me.equipped[cosmetic.slot]?.key === cosmetic.id;
  const where = slotLabel(cosmetic.slot, catalog);
  return (
    <li>
      <button
        type="button"
        className="shop-row"
        data-state={item.state}
        data-sound="select"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="shop-icon">
          <Icon name={cosmetic.icon} />
        </span>
        <span className="shop-name">
          <strong>{cosmetic.name}</strong>
          <small>{item.perLan ? `${where} · nur für diese LAN` : where}</small>
        </span>
        <RowState item={item} worn={worn} />
      </button>
    </li>
  );
}

/** Kopf mit dem Münzstand. */
function ShopHeader({ me, perLevel }: { me: Me | null; perLevel: number }) {
  return (
    <header className="shop-header">
      <h1>Shop</h1>
      {me ? (
        <p className="shop-coins" role="status">
          <Icon name="coin" />
          <strong>{coinLabel(me.coins)}</strong>
          {perLevel > 0 ? <small>+{perLevel} je Level</small> : null}
        </p>
      ) : null}
    </header>
  );
}

/** Anprobe, Knopf und Liste. */
function ShopBody({ shop, me }: { shop: ShopControls; me: Me }) {
  const { catalog } = shop;
  const items = shopItems(catalog, me);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = items.find((item) => item.cosmetic.id === chosen) ?? null;
  return (
    <>
      <section className="shop-stage" aria-label="Anprobe">
        <TryOn
          me={me}
          equipped={tryOn(me, selected, catalog)}
          pulse={shop.pulse}
          settings={shop.game.settings}
        />
        <ShopAction key={selected?.cosmetic.id} {...{ shop, me }} item={selected} />
      </section>
      <ul className="shop-list" aria-label="Cosmetics">
        {items.map((item) => (
          <ShopRow
            key={item.cosmetic.id}
            {...{ item, me, catalog }}
            selected={item === selected}
            onSelect={() => {
              setChosen(item.cosmetic.id);
              shop.clearError();
            }}
          />
        ))}
      </ul>
    </>
  );
}

/**
 * Was unter dem Kopf steht. Bis Rust geantwortet hat, nur ein Hinweis: Vorher hielte der Stand noch
 * die Beispieldaten der Vorschau.
 */
function ShopContent({ shop, me }: { shop: ShopControls; me: Me | null }) {
  if (!shop.ready) {
    return (
      <p className="shop-empty" role="status">
        Der Shop öffnet …
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
  const { settings, lan } = shop.game;
  const me = shop.ready ? shop.game.me : null;
  useDocumentTheme(
    me?.color ?? "mint",
    settings.reducedMotion ?? OS_REDUCED_MOTION,
    settings.optimizedRendering,
  );
  useClickSounds(settings, shop.error);
  return (
    <main className="shop" aria-label="Shop">
      <WindowTools name="Shop" quietClose onAction={(action) => void shop.windowAction(action)} />
      <ShopHeader me={me} perLevel={lan.rules.coins_per_level} />
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
