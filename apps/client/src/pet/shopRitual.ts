/**
 * Was die Momente im Laden auf der Bühne auslösen, als reine Rechnung: wohin die Funken einer Ware
 * fliegen, wie ihre Anprobe klingt, wie Runenkreis und Raum einem Kauf oder dem Anlegen folgen und
 * was die Börse zeigt, während die Münzen in die Schale fallen.
 *
 * Die Zeiten kommen aus `shopTimeline.ts`. Abgespielt wird es in `shop/useShopMoments.ts` (Wahl)
 * und `shop/useSealRitual.ts` (Siegel).
 *
 * @module
 */

import type { ShopItem } from "./shop";
import type { RuneState, StageSpotName } from "./shopStage";
import type { CosmeticSlot } from "./types";

import { ADORN, TRY_ON, type PurchaseTimeline } from "./shopTimeline";

/** Wo Funken und Klang einer Ware landen, je Platz am Jelly. */
export const SLOT_SPOTS: Readonly<Record<CosmeticSlot, StageSpotName>> = {
  head: "slotHead",
  face: "slotFace",
  body: "slotBody",
  hands: "slotHands",
  aura: "slotAura",
};

/** Wo die Effekte von `item` landen. */
export function wareSpot(item: ShopItem): StageSpotName {
  return SLOT_SPOTS[item.cosmetic.slot];
}

/** Ob das Jelly `item` zeigen kann: Nur Cosmetics mit Modell (`modelKeys`) erscheinen am Kunden. */
export function hasLook(item: ShopItem, modelKeys: readonly string[]) {
  return modelKeys.includes(item.cosmetic.id);
}

/**
 * Wo Kaufzauber und Anlegen einschlagen: am Platz der Ware, ohne Abbild mitten im Kunden. Sonst
 * träfe der Zauber eine leere Stelle, an der nichts erscheint.
 */
export function magicSpot(item: ShopItem, modelKeys: readonly string[]): StageSpotName {
  return hasLook(item, modelKeys) ? wareSpot(item) : "customerCentre";
}

/** So lange nach seinem Beginn erreicht das „Puff“ der Anprobe seinen Gipfel (`shop/sound`). */
export const TRY_ON_SOUND_PEAK_MS = 80;

/** Wie die Anprobe von `item` klingt: Grundton nach Platz, zu teuer und schon gekauft eigens. */
export function tryOnSound(item: ShopItem) {
  const variant: "owned" | "short" | null =
    item.state === "affordable" ? null : item.state === "owned" ? "owned" : "short";
  return {
    slot: item.cosmetic.slot,
    price: item.price,
    ...(variant ? { variant } : {}),
    // Das „Puff“ fällt auf den Augenblick, in dem das Teil aufspringt.
    delayMs: TRY_ON.pop - TRY_ON_SOUND_PEAK_MS,
  } as const;
}

/** Wie die Bühne aussieht: Runenkreis unter dem Kunden und ob der Raum für den Zauber abdunkelt. */
export interface StageLook {
  circle: RuneState;
  dim: "kauf" | null;
}

/** Eine Änderung der Bühne `at` Millisekunden nach ihrem Moment. */
export interface StageChange extends Partial<StageLook> {
  at: number;
}

/** Der Raum, bevor etwas geschieht. */
export const RESTING_STAGE: StageLook = { circle: "ruhe", dim: null };

/**
 * Die Bühne beim Kauf ab C: Der Raum dunkelt ab, beim Einschlag flammen die Runen auf, wenn alles
 * ruht, leuchten sie wieder wie bei der Anprobe und das Licht kommt zurück.
 */
export function purchaseStage({ impact, settled }: PurchaseTimeline): StageChange[] {
  return [
    { at: 0, dim: "kauf" },
    { at: impact, circle: "zauber" },
    { at: settled, circle: "anprobe", dim: null },
  ];
}

/** Die Bühne beim Anlegen: Die Runen schwellen bis `ADORN.peak` an und ruhen ab `ADORN.end`. */
export function adornStage(): StageChange[] {
  return [
    { at: 0, circle: "anlegen" },
    { at: ADORN.end, circle: "anprobe" },
  ];
}

/** Die Bühne, solange das Siegel lädt: Der Raum dunkelt schon ab. */
export const CHARGE_STAGE: readonly StageChange[] = [{ at: 0, dim: "kauf" }];

/** Die Bühne, wenn das Siegel vorher losgelassen wird oder der Kauf scheitert: wieder hell. */
export const CALM_STAGE: readonly StageChange[] = [{ at: 0, dim: null }];

/**
 * Was die Börse zeigt, sobald Münze `index` von `count` in der Schale liegt: eine weniger als vor
 * dem Kauf je gelandeter Münze. Nach der letzten wieder die echte Zahl (`null`). Bei mehr als sechs
 * Münzen zählt sie von dort aus selbst weiter.
 */
export function coinHold(before: number, index: number, count: number): number | null {
  return index + 1 >= count ? null : before - (index + 1);
}

/** Die Werte von `look` nach den Änderungen in `changes`, die bis `at` gelten. */
export function stageAt(look: StageLook, changes: readonly StageChange[], at: number): StageLook {
  return changes
    .filter((change) => change.at <= at)
    .reduce<StageLook>(
      (current, { circle = current.circle, dim = current.dim }) => ({ circle, dim }),
      look,
    );
}
