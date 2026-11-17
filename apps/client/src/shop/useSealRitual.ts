/**
 * Das Siegel lenkt den ganzen Laden (Spec §11): Wer es hält, lädt nach 250 ms den Zauber, der
 * Stempel bringt den Spruch, und ab C (bestätigt und gestempelt) läuft ein einziger Takt aus
 * `pet/shopTimeline.ts` für Münzen, Börse, Glocke, Komet, Einschlag, Licht, Runen, Zauberer und
 * Kundschaft. Ein Tipp legt an oder ab, ein Fehler lässt das Siegel springen und den Zauber
 * verpuffen.
 *
 * Funken spielt `shopFx`, Klang `shopSound`, Licht und Runen der Lenker der Bühne
 * (`useStageCues.ts`), alles andere der Zauberer über seine Hinweise.
 *
 * @module
 */

import { COSMETIC_MODEL_KEYS } from "@jelly/scene/cosmetic-keys";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Me, ShopItem } from "../pet";
import type { SealPhase } from "../pet/sealCeremony";
import type { StageDirector } from "./useStageCues";
import type { WizardControls } from "./useWizard";

import { SEAL_TIMING } from "../pet/sealCeremony";
import { isWorn } from "../pet/shopLedger";
import {
  adornStage,
  CALM_STAGE,
  CHARGE_STAGE,
  coinHold,
  magicSpot,
  purchaseStage,
} from "../pet/shopRitual";
import { ritualTimes } from "../pet/shopScore";
import { CHARGE, purchaseTimeline } from "../pet/shopTimeline";
import { shopFx } from "./fx/sparksEngine";
import { shopSound } from "./sound/shopSound";

/** Was die Börse stattdessen zeigt, solange ein Kauf läuft. `null` zeigt die Münzen. */
export type PurseHold = (hold: number | null) => void;

/** Was das Ritual braucht. */
export interface RitualOptions {
  me: Me;
  /** Reduzierte Bewegung: Keine Münze fliegt, die Börse springt mit der ersten auf ihre neue Zahl. */
  calm: boolean;
  notice: WizardControls["notice"];
  director: StageDirector;
  onPurseHold: PurseHold;
  /** Eine Ware wurde gekauft. Sie bleibt oben auf der Rolle stehen. */
  onBought: (id: string) => void;
}

/** Wie weit ein Ritual ist: geladen, gestempelt oder nichts davon. */
type Charge = "charged" | "committed" | null;

/** Was ein Ritual sich merkt, über alle Phasen. */
interface RitualRun {
  charge: Charge;
  /** Ob die Ware beim Stempeln schon gekauft war und ob das Jelly sie trug: Dann ist es ein Tipp. */
  owned: boolean;
  worn: boolean;
  /** Die Münzen vor dem Kauf. */
  before: number;
  timer: number | undefined;
}

/** Die Mitte des Wachses im Fenster, für die Spritzer des Stempels. */
function sealPoint() {
  const rect = document.querySelector("#shop-seal .seal-disc")?.getBoundingClientRect();
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
}

/** Der Zauber lädt sich auf: Kugel, Funken, Licht, Summen und der dunkle Raum. */
function charge(run: RitualRun, options: RitualOptions, item: ShopItem) {
  run.charge = "charged";
  options.notice({ kind: "hold", item });
  shopSound.charge(true);
  shopFx.play({ kind: "charge" });
  options.director.light("charge");
  options.director.stage(CHARGE_STAGE);
}

/** Die Ladung verfliegt: Summen und Funken hören auf, der Raum wird hell. */
function discharge(run: RitualRun, options: RitualOptions, light: "release" | "fizzle") {
  run.charge = null;
  shopSound.charge(false);
  shopFx.cancel("charge");
  options.director.light(light);
  options.director.stage(CALM_STAGE);
}

/** Der Stempel fällt: der Spruch, ein dumpfer Schlag und Wachsspritzer. */
function stamp(run: RitualRun, options: RitualOptions, item: ShopItem) {
  window.clearTimeout(run.timer);
  run.owned = item.state === "owned";
  run.worn = isWorn(options.me, item);
  const delayMs = SEAL_TIMING.impactMs;
  const seal = sealPoint();
  if (seal) shopFx.play({ kind: "wax", at: seal, delayMs });
  if (run.owned) {
    shopSound.cue("stampLight", { delayMs });
    return;
  }
  // Ohne Halten (Screenreader) lädt der Zauber erst jetzt.
  if (run.charge === null) charge(run, options, item);
  run.charge = "committed";
  run.before = options.me.coins;
  options.onPurseHold(options.me.coins);
  options.notice({ kind: "commit", item });
  shopSound.cue("stamp", { delayMs });
}

/** Ab C: Münzen, Börse, Glocke, Komet, Einschlag, Licht, Runen und der Zauberer im selben Takt. */
function purchase(run: RitualRun, options: RitualOptions, item: ShopItem) {
  const timeline = purchaseTimeline(item.price);
  const count = timeline.coins.length;
  const flightMs = (timeline.coins[0]?.land ?? 0) - (timeline.coins[0]?.launch ?? 0);
  run.charge = null;
  shopSound.charge(false);
  shopFx.cancel("charge");
  shopFx.play({
    kind: "coins",
    launchesMs: timeline.coins.map((coin) => coin.launch),
    flightMs,
    onLand: (index) =>
      options.onPurseHold(options.calm ? null : coinHold(run.before, index, count)),
  });
  const { burst: burstMs, impact: impactMs } = timeline;
  // Ohne Abbild schlägt der Zauber mitten im Kunden ein, nicht an einem leeren Platz.
  const to = magicSpot(item, COSMETIC_MODEL_KEYS);
  shopFx.play({ kind: "spell", to, feet: "feet", burstMs, impactMs });
  shopSound.purchase(ritualTimes(timeline));
  options.director.light("spell", timeline);
  options.director.stage(purchaseStage(timeline));
  options.notice({ kind: "bought", item, timeline });
  options.onBought(item.cosmetic.id);
}

/** Ein Tipp hat angelegt oder abgelegt: Wölkchen und Runen oder ein Hauch. */
function equipped(run: RitualRun, options: RitualOptions, item: ShopItem) {
  const worn = !run.worn;
  const at = magicSpot(item, COSMETIC_MODEL_KEYS);
  shopFx.play({ kind: worn ? "puff" : "drift", at });
  shopSound.cue(worn ? "equip" : "takeOff");
  if (worn) options.director.stage(adornStage());
  options.notice({ kind: "equipped", item, worn });
}

/** Der Server hat abgelehnt: Das Siegel springt, der Zauber verpufft an der Kugel. */
function failed(run: RitualRun, options: RitualOptions, item: ShopItem) {
  options.onPurseHold(null);
  shopSound.sfx("fizzle");
  if (run.owned) return;
  shopFx.play({ kind: "fizzle" });
  discharge(run, options, "fizzle");
  options.notice({ kind: "buyFailed", item });
}

/** Was jede Phase des Siegels auslöst. */
const PHASES: Partial<
  Record<SealPhase, (run: RitualRun, options: RitualOptions, item: ShopItem) => void>
> = {
  holding: (run, options, item) => {
    window.clearTimeout(run.timer);
    run.timer = window.setTimeout(() => charge(run, options, item), CHARGE.lateHold);
  },
  idle: (run, options) => {
    window.clearTimeout(run.timer);
    // Zu früh losgelassen: Er entspannt sich, alles andere auch.
    if (run.charge !== "charged") return;
    discharge(run, options, "release");
    options.notice({ kind: "release" });
  },
  stamping: stamp,
  sealed: (run, options, item) => (run.owned ? equipped : purchase)(run, options, item),
  cracked: failed,
};

/**
 * Hört auf die Phasen des Siegels und lässt den Laden mitspielen.
 *
 * @returns Die aktuelle Phase und `onPhase` für `ShopSeal`, stabil.
 */
export function useSealRitual(options: RitualOptions) {
  const [phase, setPhase] = useState<SealPhase>("idle");
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const [run] = useState<RitualRun>(() => ({
    charge: null,
    owned: false,
    worn: false,
    before: 0,
    timer: undefined,
  }));
  useEffect(
    () => () => {
      window.clearTimeout(run.timer);
      shopSound.charge(false);
      shopFx.cancel();
    },
    [run],
  );
  const onPhase = useCallback(
    (next: SealPhase, item: ShopItem) => {
      setPhase(next);
      PHASES[next]?.(run, latest.current, item);
    },
    [run],
  );
  return { phase, onPhase };
}
