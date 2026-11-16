/**
 * Die Pergament-Rolle des Zauberladens: alle Teile mit Preis, oder dass sie schon dem Jelly
 * gehören. Ein Klick probiert ein Teil an, gekauft wird erst am Siegel.
 *
 * @module
 */

import { coinLabel, slotLabel, type Catalog, type Me, type ShopItem } from "../pet";
import { Icon } from "../ui";

/** Ob `me` das Teil gerade trägt. */
export function isWorn(me: Me, item: ShopItem) {
  return me.equipped[item.cosmetic.slot]?.key === item.cosmetic.id;
}

/** Was rechts in einer Zeile steht: der Preis, oder dass es schon da ist. */
function RowState({ item, worn }: { item: ShopItem; worn: boolean }) {
  if (item.state === "owned") {
    return <span className="ledger-owned">{worn ? "Angelegt" : "Gekauft"}</span>;
  }
  return (
    <span className="ledger-price" aria-label={coinLabel(item.price)}>
      <Icon name="coin" />
      {item.price}
    </span>
  );
}

/** Eine Zeile der Rolle. */
function LedgerRow({
  item,
  me,
  catalog,
  selected,
  onChoose,
}: {
  item: ShopItem;
  me: Me;
  catalog: Catalog;
  selected: boolean;
  onChoose: (item: ShopItem) => void;
}) {
  const { cosmetic } = item;
  const where = slotLabel(cosmetic.slot, catalog);
  return (
    <li>
      <button
        type="button"
        className="ledger-row"
        data-state={item.state}
        data-sound="select"
        aria-pressed={selected}
        onClick={() => onChoose(item)}
      >
        <span className="ledger-icon">
          <Icon name={cosmetic.icon} />
        </span>
        <span className="ledger-name">
          <strong>{cosmetic.name}</strong>
          <small>{item.perLan ? `${where} · nur für diese LAN` : where}</small>
        </span>
        <RowState item={item} worn={isWorn(me, item)} />
      </button>
    </li>
  );
}

/** Die ganze Rolle. `chosen` ist das Teil, das das Jelly gerade anprobiert. */
export default function ShopLedger({
  items,
  me,
  catalog,
  chosen,
  onChoose,
}: {
  items: ShopItem[];
  me: Me;
  catalog: Catalog;
  chosen: ShopItem | null;
  onChoose: (item: ShopItem) => void;
}) {
  return (
    <section className="shop-ledger" aria-labelledby="ledger-title">
      <h2 id="ledger-title">Waren</h2>
      <ul>
        {items.map((item) => (
          <LedgerRow
            key={item.cosmetic.id}
            {...{ item, me, catalog, onChoose }}
            selected={item === chosen}
          />
        ))}
      </ul>
    </section>
  );
}
