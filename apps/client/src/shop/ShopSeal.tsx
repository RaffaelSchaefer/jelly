/**
 * Der Kaufbrief neben der Rolle: ein Brief aus Pergament mit Name, Geschichte und Fakten der
 * gewählten Ware, darunter das Wachssiegel. Kaufen heißt, das Siegel 650 ms zu halten
 * (`useSealCeremony.ts`). Danach wird der Brief zur Quittung, und das Jelly behält die Ware an.
 *
 * Was der Zauberer dazu sagt und was Börse, Licht und Ton tun, löst `Shop.tsx` über `onPhase` aus.
 *
 * @module
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import type { SealLook, SealPhase, SealWax } from "../pet/sealCeremony";
import type { ShopControls } from "./useShop";
import type { WizardControls } from "./useWizard";

import { coinLabel, shopItems, type Me, type ShopItem } from "../pet";
import { SEAL_CSS_TIMES, sealLabel } from "../pet/sealCeremony";
import { isWorn } from "../pet/shopLedger";
import { Icon, type IconName } from "../ui";
import { uiSounds } from "../uiSound";
import {
  BriefFacts,
  BriefHead,
  BriefLore,
  EmptyLetter,
  PaidStamp,
  ReceiptFacts,
  type Receipt,
} from "./BriefParts";
import { useSealCeremony, type SealSubject } from "./useSealCeremony";
import "./css/brief.css";
import "./css/seal.css";

/** Die Zeiten der Zeremonie als CSS-Variablen, damit Bild und Ablauf zusammenbleiben. */
const SEAL_STYLE = SEAL_CSS_TIMES as CSSProperties;

/** Das Zeichen im Wachs. */
const WAX_ICONS: Record<SealWax, IconName> = {
  buy: "coin",
  wear: "check",
  off: "close",
  locked: "lock",
};

/** Eigenschaften des Kaufbriefs. */
export interface ShopSealProps {
  shop: ShopControls;
  /** Der Zauberer. Was er sagt, löst `Shop.tsx` über `onPhase` aus. */
  wizard: WizardControls;
  me: Me;
  /** Die gewählte Ware, ohne Wahl `null`. */
  item: ShopItem | null;
  /** Bei jedem Wechsel der Phase des Siegels, mit der Ware, um die es geht. */
  onPhase?: (phase: SealPhase, item: ShopItem) => void;
  /** Beendet die Anprobe. Ohne gibt es keinen Knopf dafür. */
  onDismiss?: () => void;
}

/** Die Quittung über einen Kauf. */
function receiptFor(item: ShopItem, coinsBefore: number): Receipt {
  return {
    itemId: item.cosmetic.id,
    price: item.price,
    left: coinsBefore - item.price,
    at: Date.now(),
  };
}

/** Siegel und Quittung des Kaufbriefs. */
function useBrief({ shop, me, item, onPhase }: ShopSealProps) {
  const worn = item ? isWorn(me, item) : false;
  const input = {
    worn,
    open: shop.open,
    busy: shop.busy,
    perLevel: shop.game.lan.rules.coins_per_level,
  };
  const mode = item ? sealLabel({ ...input, item, phase: "idle" }).mode : "locked";
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const coinsBefore = useRef(me.coins);

  const ceremony = useSealCeremony({
    item,
    worn,
    mode,
    commit: ({ item: ware, worn: wasWorn, mode: how }) =>
      how === "tap"
        ? shop.equip(ware.cosmetic.slot, wasWorn ? null : ware.cosmetic.id)
        : shop.purchaseAndWear(ware),
    onPhase: (phase, subject: SealSubject) => {
      if (phase === "stamping") coinsBefore.current = me.coins;
      if (phase === "sealed" && subject.mode === "hold") {
        setReceipt(receiptFor(subject.item, coinsBefore.current));
      }
      onPhase?.(phase, subject.item);
    },
    onBlocked: () => uiSounds.play("blocked"),
  });

  // Die Quittung gilt, solange ihre Ware gewählt bleibt.
  const itemId = item?.cosmetic.id ?? null;
  useEffect(() => setReceipt((kept) => (kept?.itemId === itemId ? kept : null)), [itemId]);

  // Während der Zeremonie zählt die Ware, wie sie beim Stempeln war.
  const subject = ceremony.subject ?? (item ? { item, worn, mode } : null);
  const look = subject
    ? sealLabel({ ...input, item: subject.item, worn: subject.worn, phase: ceremony.state.phase })
    : null;
  return { ceremony, look, receipt: receipt?.itemId === itemId ? receipt : null };
}

/** Der Fokus geht zurück auf die gewählte Ware der Rolle. */
function focusChosen() {
  document.querySelector<HTMLElement>('.ledger-list [aria-selected="true"]')?.focus();
}

/** Escape im Kaufbrief führt zurück auf die Rolle. */
function backToLedger(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  focusChosen();
}

/** Zwei Sprünge, die durch das Wachs laufen, wenn der Kauf scheitert. */
function Cracks() {
  return (
    <svg className="seal-cracks" viewBox="0 0 40 40" aria-hidden="true">
      <polyline points="5,15 12,17 16,13 21,19 27,16 35,22" />
      <polyline points="19,4 18,11 22,16 19,23 23,29 21,36" />
    </svg>
  );
}

/** Das Wachssiegel mit Ring, Etikett und Hinweis. */
function SealButton({
  look,
  phase,
  itemId,
  hint,
  bind,
}: {
  look: SealLook;
  phase: SealPhase;
  itemId: string;
  hint: boolean;
  bind: ReturnType<typeof useSealCeremony>["bind"];
}) {
  return (
    <div className="brief-seal">
      <button
        id="shop-seal"
        type="button"
        className="seal"
        data-mode={look.mode}
        data-wax={look.wax}
        data-phase={phase}
        data-hint={hint || undefined}
        data-sound="none"
        data-hover-sound="wax"
        data-gaze="seal"
        data-item-id={itemId}
        aria-disabled={look.mode === "locked"}
        aria-describedby="seal-hint"
        aria-label={look.srLabel}
        {...bind}
      >
        <span className="seal-disc" aria-hidden="true">
          <span className="seal-ring" />
          <span className="seal-wax">
            <Icon name={WAX_ICONS[look.wax]} />
            <span className="seal-monogram">Z</span>
            <Cracks />
          </span>
        </span>
        <span className="seal-plate" aria-hidden="true">
          <span className="seal-label">
            {look.label}
            {look.price === null ? null : (
              <span className="seal-price">
                <Icon name="coin" />
                {look.price}
              </span>
            )}
          </span>
          <span className="seal-sub">{look.sub}</span>
        </span>
      </button>
      <span id="seal-hint" className="seal-hint" data-shown={hint || undefined}>
        {look.hint}
        {look.assist ? <span className="sr-only"> {look.assist}</span> : null}
      </span>
    </div>
  );
}

/** Der Kaufbrief. Ohne Wahl lädt er ein, eine Ware von der Rolle zu nehmen. */
export default function ShopSeal(props: ShopSealProps) {
  const { shop, me, item, onDismiss } = props;
  const { ceremony, look, receipt } = useBrief(props);
  const { phase, hint } = ceremony.state;
  const dismiss = onDismiss
    ? () => {
        focusChosen();
        onDismiss();
      }
    : undefined;
  return (
    <section
      className="shop-brief"
      aria-labelledby="brief-title"
      data-phase={phase}
      data-receipt={receipt ? "" : undefined}
      style={SEAL_STYLE}
      onKeyDown={backToLedger}
    >
      <div className="brief-letter">
        {item ? (
          <>
            <BriefHead {...{ item, receipt }} catalog={shop.catalog} onDismiss={dismiss} />
            {receipt ? <PaidStamp /> : null}
            <BriefLore item={item} />
            {receipt ? (
              <ReceiptFacts item={item} receipt={receipt} />
            ) : (
              <BriefFacts {...{ item, me }} catalog={shop.catalog} open={shop.open} />
            )}
          </>
        ) : (
          <EmptyLetter me={me} items={shopItems(shop.catalog, me)} open={shop.open} />
        )}
      </div>
      {item && look ? (
        <SealButton {...{ look, phase, hint }} itemId={item.cosmetic.id} bind={ceremony.bind} />
      ) : null}
      <p className="sr-only" role="status">
        {receipt && item
          ? `Gekauft: ${item.cosmetic.name}. Übrig: ${coinLabel(receipt.left)}.`
          : (look?.status ?? "")}
      </p>
    </section>
  );
}
