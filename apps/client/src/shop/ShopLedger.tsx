/**
 * Die Pergament-Rolle des Zauberladens: eine Liste aller Waren. Oben steht, was man kaufen kann,
 * unter „In deiner Truhe“, was dem Jelly schon gehört. Wählen probiert eine Ware an, gekauft wird
 * erst am Siegel. Die Pfeiltasten gehen durch die Rolle (`useLedgerKeys.ts`).
 *
 * @module
 */

import { useMemo } from "react";

import type { Catalog, Me, ShopItem } from "../pet";

import { isWorn, ledgerOrder, ledgerView } from "../pet/shopLedger";
import { Icon } from "../ui";
import { useLedgerKeys } from "./useLedgerKeys";
import WareCard from "./WareCard";
import "./css/ledger.css";

export { isWorn };

/** Eigenschaften von {@link ShopLedger}. */
export interface LedgerProps {
  items: ShopItem[];
  me: Me;
  catalog: Catalog;
  /** Die Ware, die das Jelly gerade anprobiert. */
  chosenId: string | null;
  /** Die eben gekaufte Ware: Sie bleibt oben stehen, bis eine andere gewählt wird. */
  keepId: string | null;
  /** Ob gerade eine LAN läuft. */
  open: boolean;
  /** Solange das Siegel stempelt, bleibt die Wahl, wie sie ist. */
  frozen: boolean;
  /** Wählt eine Ware, `null` legt die Anprobe ab. */
  onChoose: (item: ShopItem | null) => void;
}

/** Was die Rolle sagt, wenn oben nichts mehr zu kaufen ist. */
function LedgerNote({ wares, chest }: { wares: number; chest: number }) {
  if (wares > 0) return null;
  const note = chest > 0 ? "Ausverkauft! Alles gehört dir." : "Die Regale sind leer.";
  return <p className="ledger-empty">{note}</p>;
}

/** Die ganze Rolle. */
export default function ShopLedger({
  items,
  me,
  catalog,
  chosenId,
  keepId,
  open,
  frozen,
  onChoose,
}: LedgerProps) {
  const view = useMemo(() => ledgerView(items, me, keepId), [items, me, keepId]);
  const order = useMemo(() => ledgerOrder(view), [view]);
  const sections = useMemo(() => [view.wares.length, view.chest.length], [view]);
  const keys = useLedgerKeys({ order, sections, frozen, onChoose });
  // Genau ein Tab-Halt: die gewählte Ware, sonst die erste.
  const focusId = chosenId ?? order[0]?.cosmetic.id ?? null;

  /** Ein Klick wählt. Die Anprobe klingt selbst (`useShopMoments.ts`). */
  function pick(item: ShopItem) {
    if (frozen) return;
    onChoose(item);
  }

  const card = (item: ShopItem, index: number) => (
    <WareCard
      key={item.cosmetic.id}
      {...{ item, catalog, index, open }}
      worn={isWorn(me, item)}
      chosen={item.cosmetic.id === chosenId}
      focusable={item.cosmetic.id === focusId}
      justBought={item.cosmetic.id === keepId}
      onPick={pick}
    />
  );

  return (
    <section className="shop-ledger" aria-labelledby="ledger-title">
      <div className="ledger-paper" data-rustle="">
        <h2 id="ledger-title" className="ledger-title">
          Waren
        </h2>
        <LedgerNote wares={view.wares.length} chest={view.chest.length} />
        <ul
          ref={keys.listRef}
          className="ledger-list"
          role="listbox"
          aria-labelledby="ledger-title"
          data-gaze="ledger"
          onKeyDown={keys.onKeyDown}
        >
          {view.wares.map((item, index) => card(item, index))}
          {view.chest.length > 0 ? (
            <li className="ledger-divider" aria-hidden="true">
              <Icon name="chest" />
              In deiner Truhe
            </li>
          ) : null}
          {view.chest.map((item, index) => card(item, view.wares.length + index))}
        </ul>
      </div>
    </section>
  );
}
