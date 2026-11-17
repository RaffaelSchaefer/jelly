/**
 * Die Vorschau der Effekte im Browser, ohne Server und ohne Klick: `#shop-anprobe` probiert alle
 * drei Sekunden eine andere Ware an, `#shop-zauber` spielt alle 4,5 s den Kaufzauber mit Ladung,
 * Münzen, Komet und Einschlag. Licht, Runenkreis, Abdunkeln und der Hüpfer des Kunden spielen mit,
 * Münzen und Besitz bleiben, wie sie sind. Auf dem Desktop nie.
 *
 * @module
 */

import { COSMETIC_MODEL_KEYS } from "@jelly/scene/cosmetic-keys";
import { useEffect, useState } from "react";

import type { LightCue } from "../pet/shopLight";
import type { RuneState, StageSpotName } from "../pet/shopStage";

import { desktop } from "../backend";
import {
  equipColor,
  withEquipped,
  type Catalog,
  type CatalogCosmetic,
  type CosmeticSlot,
  type Equipped,
} from "../pet";
import { SLOT_SPOTS } from "../pet/shopRitual";
import { purchaseTimeline } from "../pet/shopTimeline";
import { shopFx } from "./fx/sparksEngine";

/** Die Hashes der Vorschau und was sie spielen. */
const REPLAYS: Readonly<Record<string, "anprobe" | "zauber">> = {
  "#shop-anprobe": "anprobe",
  "#shop-zauber": "zauber",
};

/** Was die Vorschau unter dem Hash dieser Seite spielt. */
const REPLAY = desktop ? null : (REPLAYS[location.hash] ?? null);

/** Abstände der Anproben und der Zauber, und wann die erste Runde beginnt. */
const TRY_ON_EVERY_MS = 3000;
const SPELL_EVERY_MS = 4500;
const FIRST_MS = 1500;

/** Ab der Ladung: Das Siegel ist nach 400 ms gedrückt, gestempelt 160 ms später, bestätigt bei C. */
const STAMP_MS = 560;
const CONFIRM_MS = 820;

/** Der Preis des vorgespielten Kaufs: drei Münzen. */
const PRICE = 3;

/** Was die Bühne zeigt. Die Vorschau überschreibt Teile davon. */
export interface StageShow {
  /** Was das eigene Jelly trägt, samt Anprobe. */
  equipped: Equipped;
  circle: RuneState;
  dim: "kauf" | null;
  lightCue: LightCue | null;
  /** Hüpfer des Kunden. */
  pulse: number;
  /** Aufflammen der Kristallkugel. */
  wizardPulse: number;
}

/** Was die Vorschau gerade ändert. */
interface Shown {
  ware: CatalogCosmetic | null;
  circle: RuneState;
  dim: "kauf" | null;
  lightCue: LightCue | null;
  hops: number;
  flares: number;
}

/** Ändert, was die Vorschau zeigt. */
type Show = (change: (shown: Shown) => Partial<Shown>) => void;

/** Ein Zeitgeber, der alle seine Aufträge auf einmal abbrechen kann. */
function createTimers() {
  const pending = new Set<number>();
  return {
    after(ms: number, run: () => void) {
      const timer = window.setTimeout(() => {
        pending.delete(timer);
        run();
      }, ms);
      pending.add(timer);
    },
    clear: () => pending.forEach((timer) => window.clearTimeout(timer)),
  };
}

/** Wo die Effekte einer Ware landen. */
function slotSpot(ware: CatalogCosmetic): StageSpotName {
  return SLOT_SPOTS[ware.slot as CosmeticSlot] ?? "slotHead";
}

/** Die Mitte des Siegels im Fenster, falls der Kaufbrief offen ist. */
function sealPoint() {
  const rect = document.querySelector("#shop-seal")?.getBoundingClientRect();
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
}

/** Eine Anprobe: Funken wirbeln auf den Platz, die Kerzen ducken sich, die Runen erwachen. */
function tryOn(ware: CatalogCosmetic, show: Show) {
  show(() => ({ ware, circle: "anprobe", lightCue: { kind: "tryOn", at: performance.now() } }));
  shopFx.play({ kind: "swirl", at: slotSpot(ware) });
}

/** Ein Kauf zu drei Münzen, ab der Ladung am gedrückten Siegel. */
function castSpell(ware: CatalogCosmetic, show: Show, timers: ReturnType<typeof createTimers>) {
  show(() => ({
    ware,
    circle: "anprobe",
    dim: null,
    lightCue: { kind: "charge", at: performance.now() },
  }));
  shopFx.play({ kind: "charge" });
  timers.after(STAMP_MS, () => {
    const seal = sealPoint();
    if (seal) shopFx.play({ kind: "wax", at: seal });
  });
  timers.after(CONFIRM_MS, () => {
    shopFx.cancel("charge");
    const timeline = purchaseTimeline(PRICE);
    const [first] = timeline.coins;
    const flightMs = first ? first.land - first.launch : 480;
    show(() => ({ dim: "kauf", lightCue: { kind: "spell", at: performance.now(), timeline } }));
    shopFx.play({ kind: "coins", launchesMs: timeline.coins.map((coin) => coin.launch), flightMs });
    const { burst: burstMs, impact: impactMs, settled } = timeline;
    shopFx.play({ kind: "spell", to: slotSpot(ware), burstMs, impactMs });
    timers.after(burstMs, () => show((shown) => ({ flares: shown.flares + 1 })));
    timers.after(impactMs, () => show((shown) => ({ circle: "zauber", hops: shown.hops + 1 })));
    timers.after(settled, () => show(() => ({ circle: "anprobe", dim: null })));
  });
}

/** Spielt die Vorschau in Runden ab, bis die Bühne verschwindet. */
function play(wares: readonly CatalogCosmetic[], show: Show) {
  const timers = createTimers();
  let round = 0;
  const step = () => {
    const ware = wares[round % wares.length];
    round += 1;
    if (!ware) return;
    if (REPLAY === "zauber") castSpell(ware, show, timers);
    else tryOn(ware, show);
  };
  const every = REPLAY === "zauber" ? SPELL_EVERY_MS : TRY_ON_EVERY_MS;
  let interval = 0;
  timers.after(FIRST_MS, () => {
    step();
    interval = window.setInterval(step, every);
  });
  return () => {
    timers.clear();
    window.clearInterval(interval);
    shopFx.cancel();
  };
}

/** Die Waren mit Modell, die das Jelly noch nicht trägt. */
function waresFor(catalog: Catalog, worn: Equipped) {
  return catalog.cosmetics.filter(
    (entry) => COSMETIC_MODEL_KEYS.includes(entry.key) && worn[entry.slot]?.key !== entry.key,
  );
}

/**
 * Was die Bühne zeigt: ohne Vorschau-Hash genau `base`, sonst mit der vorgespielten Anprobe oder
 * dem vorgespielten Kauf.
 */
export function useFxReplay(base: StageShow, catalog: Catalog): StageShow {
  const [shown, setShown] = useState<Shown | null>(null);
  const worn = base.equipped;
  // Einmal beim Öffnen: Die Vorschau spielt die Waren, die es da gab, und läuft dann für sich.
  useEffect(() => {
    if (!REPLAY) return;
    const start: Shown = {
      ware: null,
      circle: "ruhe",
      dim: null,
      lightCue: null,
      hops: 0,
      flares: 0,
    };
    const show: Show = (change) =>
      setShown((now) => ({ ...(now ?? start), ...change(now ?? start) }));
    return play(waresFor(catalog, worn), show);
  }, []);
  if (!shown) return base;
  const { ware } = shown;
  const equipped = ware
    ? withEquipped(base.equipped, ware.slot, ware.key, equipColor(ware.key, catalog))
    : base.equipped;
  return {
    equipped,
    circle: shown.circle,
    dim: shown.dim,
    lightCue: shown.lightCue,
    pulse: base.pulse + shown.hops,
    wizardPulse: base.wizardPulse + shown.flares,
  };
}
