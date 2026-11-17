/**
 * Der Knopf unter der Anprobe: kaufen, anlegen oder ablegen, je nachdem, wie das gewählte Teil
 * steht. Läuft keine LAN oder fehlen Münzen, bleibt er gesperrt und sagt, warum.
 *
 * @module
 */

import { useState } from "react";

import type { ShopControls } from "./useShop";

import { coinLabel, type Me, type ShopItem } from "../pet";
import { PrimaryButton } from "../ui";

/** Was unter dem Knopf steht, solange das Teil noch nicht gekauft ist. */
function buyHint(item: ShopItem, open: boolean, perLevel: number) {
  if (!open) return "Münzen gibt es nur während einer LAN.";
  if (item.state === "short") {
    return perLevel > 0 ? `Jeder Level-Aufstieg bringt ${coinLabel(perLevel)}.` : "";
  }
  return item.perLan ? "Gilt nur für diese LAN." : "Gehört dir danach für immer.";
}

/** Kaufen, solange das Teil noch nicht dem Jelly gehört. */
function BuyButton({
  shop,
  item,
  onDone,
}: {
  shop: ShopControls;
  item: ShopItem;
  onDone: (notice: string) => void;
}) {
  const short = item.state === "short";
  return (
    <>
      <PrimaryButton
        data-sound="coin"
        disabled={short || !shop.open || shop.busy || !shop.ready}
        onClick={async () => {
          if (await shop.purchase(item)) onDone(`${item.cosmetic.name} gehört jetzt dir.`);
        }}
      >
        {short ? `Noch ${coinLabel(item.missing)}` : `Für ${coinLabel(item.price)} kaufen`}
      </PrimaryButton>
      <small className="shop-hint">
        {buyHint(item, shop.open, shop.game.lan.rules.coins_per_level)}
      </small>
    </>
  );
}

/** Anlegen oder wieder ablegen, sobald es dem Jelly gehört. */
function WearButton({
  shop,
  me,
  item,
  onDone,
}: {
  shop: ShopControls;
  me: Me;
  item: ShopItem;
  onDone: (notice: string) => void;
}) {
  const { id, slot } = item.cosmetic;
  const worn = me.equipped[slot]?.key === id;
  return (
    <PrimaryButton
      className={worn ? "shop-secondary" : undefined}
      data-sound={worn ? "close" : "success"}
      disabled={shop.busy || !shop.ready}
      onClick={async () => {
        if (await shop.equip(slot, worn ? null : id)) {
          onDone(worn ? "Wieder abgelegt." : "Steht dir!");
        }
      }}
    >
      {worn ? "Ablegen" : "Anlegen"}
    </PrimaryButton>
  );
}

/**
 * Knopf und Rückmeldung zum gewählten Teil. Sollte mit dem Teil neu entstehen (`key`), dann
 * verschwindet auch die letzte Rückmeldung.
 */
export default function ShopAction({
  shop,
  me,
  item,
}: {
  shop: ShopControls;
  me: Me;
  item: ShopItem | null;
}) {
  const [notice, setNotice] = useState("");
  if (!item) {
    return <p className="shop-action shop-hint">Wähle ein Teil, {me.name} probiert es an.</p>;
  }
  return (
    <div className="shop-action">
      <strong>{item.cosmetic.name}</strong>
      {item.state === "owned" ? (
        <WearButton {...{ shop, me, item }} onDone={setNotice} />
      ) : (
        <BuyButton {...{ shop, item }} onDone={setNotice} />
      )}
      <small className="shop-notice" role="status">
        {notice}
      </small>
    </div>
  );
}
