/**
 * Eine Ware auf der Rolle: Medaillon mit dem Ring ihrer Güte, Name, Platz und Güte, dazu der Preis
 * oder dass sie schon in der Truhe liegt. Als Option der Liste: Wählen probiert sie an.
 *
 * @module
 */

import type { IconName } from "../ui";

import { slotLabel, TIER_LABELS, type Catalog, type ShopItem, type ShopTier } from "../pet";
import { Icon } from "../ui";

/** Das Medaillon einer Ware. Ring und Stein zeigen ihre Güte, auch im Kaufbrief. */
export function Medallion({ icon, tier }: { icon: IconName; tier: ShopTier }) {
  return (
    <span className="medallion" data-tier={tier} aria-hidden="true">
      <Icon name={icon} />
      <span className="medallion-gem" />
    </span>
  );
}

/** Der Preis als Münze. Ohne laufende LAN zeigt sie ein Schloss. Die Zahl liest sich als „3 Münzen“. */
export function PriceToken({ price, open }: { price: number; open: boolean }) {
  return (
    <span className="price-token">
      <Icon name={open ? "coin" : "lock"} />
      {price}
      <span className="sr-only"> {price === 1 ? "Münze" : "Münzen"}</span>
    </span>
  );
}

/** Was rechts auf der Karte steht: der Preis, oder dass die Ware schon da ist. */
function WareState({ item, worn, open }: { item: ShopItem; worn: boolean; open: boolean }) {
  if (item.state === "owned") {
    return <span className="ware-owned">{worn ? "Angelegt" : "Gekauft"}</span>;
  }
  return (
    <span className="ware-cost">
      <PriceToken price={item.price} open={open} />
      {item.state === "short" ? <span className="ware-missing">fehlt {item.missing}</span> : null}
    </span>
  );
}

/** Eigenschaften von {@link WareCard}. */
export interface WareCardProps {
  item: ShopItem;
  catalog: Catalog;
  /** Ihr Platz in der Rolle, von oben gezählt. Die Harfe spielt danach ihren Ton. */
  index: number;
  /** Ob das Jelly sie gerade trägt. */
  worn: boolean;
  /** Ob sie gewählt ist und das Jelly sie anprobiert. */
  chosen: boolean;
  /** Ob sie der eine Tab-Halt der Rolle ist. */
  focusable: boolean;
  /** Ob sie eben gekauft wurde. Dann trägt sie einen Stempel. */
  justBought: boolean;
  /** Ob gerade eine LAN läuft. */
  open: boolean;
  onPick: (item: ShopItem) => void;
}

/** Eine Ware als Option der Rolle. */
export default function WareCard({
  item,
  catalog,
  index,
  worn,
  chosen,
  focusable,
  justBought,
  open,
  onPick,
}: WareCardProps) {
  const { cosmetic } = item;
  return (
    <li
      role="option"
      id={`ware-${cosmetic.id}`}
      className="ware"
      aria-selected={chosen}
      tabIndex={focusable ? 0 : -1}
      data-item-id={cosmetic.id}
      data-state={item.state}
      data-tier={item.tier}
      data-worn={worn || undefined}
      data-just-bought={justBought || undefined}
      data-hover-sound="harp"
      data-hover-step={index}
      data-sound="none"
      onClick={() => onPick(item)}
    >
      <Medallion icon={cosmetic.icon} tier={item.tier} />
      <span className="ware-text">
        <span className="ware-name">{cosmetic.name}</span>
        <span className="ware-meta">
          {slotLabel(cosmetic.slot, catalog)} · {TIER_LABELS[item.tier]}
        </span>
      </span>
      <WareState item={item} worn={worn} open={open} />
      {justBought ? (
        <span className="ware-stamp" aria-hidden="true">
          Gekauft
        </span>
      ) : null}
    </li>
  );
}
