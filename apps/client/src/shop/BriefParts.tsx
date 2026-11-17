/**
 * Die Teile des Kaufbriefs: der Kopf mit Medaillon, eine Zeile Geschichte, die Fakten zur Ware, die
 * Quittung nach dem Kauf und der Brief, solange nichts gewählt ist.
 *
 * @module
 */

import type { ReactNode } from "react";

import { COSMETIC_MODEL_KEYS } from "@jelly/scene/cosmetic-keys";

import { coinLabel, slotLabel, TIER_LABELS, type Catalog, type Me, type ShopItem } from "../pet";
import { replacedItem, shopSummary } from "../pet/shopLedger";
import { wareLore } from "../pet/shopLore";
import { IconButton } from "../ui";
import { Medallion, PriceToken } from "./WareCard";

/** Eine Quittung über einen Kauf. Sie gilt, solange die Ware gewählt bleibt. */
export interface Receipt {
  itemId: string;
  price: number;
  /** Die Münzen danach. */
  left: number;
  /** Wann gekauft wurde, in Unix-Millisekunden. */
  at: number;
}

/** Die Uhrzeit auf der Quittung. */
const CLOCK = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/** Wie lange die Ware gilt, in Worten. */
function scopeLabel(item: ShopItem) {
  return item.perLan ? "nur diese LAN" : "für immer";
}

/** Was über dem Namen steht: Kaufbrief, Truhe oder Quittung. */
function eyebrowOf(item: ShopItem, receipt: Receipt | null) {
  if (receipt) return "Quittung";
  return item.state === "owned" ? "Aus deiner Truhe" : "Kaufbrief";
}

/** Eine Zeile der Fakten. */
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="brief-fact">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Der Kopf: Medaillon, Name, Platz und Güte.
 *
 * @param onDismiss - Beendet die Anprobe. Ohne gibt es keinen Knopf dafür.
 */
export function BriefHead({
  item,
  catalog,
  receipt,
  onDismiss,
}: {
  item: ShopItem;
  catalog: Catalog;
  receipt: Receipt | null;
  onDismiss?: () => void;
}) {
  return (
    <header className="brief-head">
      <p className="brief-eyebrow">{eyebrowOf(item, receipt)}</p>
      <Medallion icon={item.cosmetic.icon} tier={item.tier} />
      <div className="brief-heading">
        <h2 id="brief-title" className="brief-title">
          {item.cosmetic.name}
        </h2>
        <p className="brief-meta">
          {slotLabel(item.cosmetic.slot, catalog)} · {TIER_LABELS[item.tier]}
        </p>
      </div>
      {onDismiss ? (
        <IconButton
          icon="close"
          label="Anprobe beenden"
          className="brief-close"
          data-sound="close"
          onClick={onDismiss}
        />
      ) : null}
    </header>
  );
}

/** Eine Zeile Geschichte zur Ware. Wird es eng, bleibt sie nur für Screenreader. */
export function BriefLore({ item }: { item: ShopItem }) {
  return <p className="brief-lore">{wareLore(item.cosmetic.id, item.cosmetic.slot)}</p>;
}

/** Was man vor dem Kauf wissen muss: Preis, wie lange sie gilt, was sie ersetzt, ob man sie sieht. */
export function BriefFacts({
  item,
  me,
  catalog,
  open,
}: {
  item: ShopItem;
  me: Me;
  catalog: Catalog;
  open: boolean;
}) {
  const replaced = replacedItem(me, item, catalog);
  return (
    <dl className="brief-facts">
      <Fact term="Preis">
        {item.state === "owned" ? "bezahlt" : <PriceToken price={item.price} open={open} />}
      </Fact>
      <Fact term="Gilt">{scopeLabel(item)}</Fact>
      {replaced ? <Fact term="Ersetzt">{replaced}</Fact> : null}
      {COSMETIC_MODEL_KEYS.includes(item.cosmetic.id) ? null : (
        <Fact term="Anprobe">noch ohne Abbild</Fact>
      )}
    </dl>
  );
}

/** Die Quittung: was bezahlt wurde, was übrig ist, wann. */
export function ReceiptFacts({ item, receipt }: { item: ShopItem; receipt: Receipt }) {
  return (
    <dl className="brief-facts brief-receipt">
      <Fact term="Bezahlt">{coinLabel(receipt.price)}</Fact>
      <Fact term="Übrig">{coinLabel(receipt.left)}</Fact>
      <Fact term="Zeit">{CLOCK.format(receipt.at)} Uhr</Fact>
      <Fact term="Gilt">{scopeLabel(item)}</Fact>
    </dl>
  );
}

/** Der Stempel quer über der Quittung. */
export function PaidStamp() {
  return (
    <span className="brief-paid" aria-hidden="true">
      Bezahlt
    </span>
  );
}

/** Der Brief ohne Wahl: eine Einladung und was der Laden gerade zu bieten hat. */
export function EmptyLetter({
  me,
  items,
  open,
}: {
  me: Me;
  items: readonly ShopItem[];
  open: boolean;
}) {
  return (
    <div className="brief-empty">
      <h2 id="brief-title" className="brief-title">
        Kaufbrief
      </h2>
      <p className="brief-invite">
        Wähle eine Ware von der Rolle. {me.name} probiert sie gleich an.
      </p>
      <p className="brief-summary">{shopSummary(items, me.coins, open)}</p>
    </div>
  );
}
