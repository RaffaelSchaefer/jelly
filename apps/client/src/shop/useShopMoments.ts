/**
 * Was eine neue Wahl auf der Bühne auslöst (`nextMoment` aus `pet/shopTimeline.ts`): Bei der
 * Anprobe wirbeln Funken auf den Platz am Jelly, das Teil springt bei `TRY_ON.pop` auf, ein „Puff“
 * fällt genau darauf, die Kerzen ducken sich, die Runen erwachen, und der Zauberer erfährt davon.
 * Eine schon gekaufte Ware glänzt dazu. Wer die Wahl aufhebt, lässt die Runen ruhen.
 *
 * Eine Ware ohne Modell kann das Jelly nicht zeigen. Dann verpufft der Zauber am Platz, und nur das
 * Pergament raschelt: Die Bühne verspricht keine Anprobe, die nicht kommt.
 *
 * Anlegen, Ablegen und Kauf kommen vom Siegel (`useSealRitual.ts`), sie zählen hier nicht.
 *
 * @module
 */

import { COSMETIC_MODEL_KEYS } from "@jelly/scene/cosmetic-keys";
import { useEffect, useLayoutEffect, useRef } from "react";

import type { Me, ShopItem } from "../pet";
import type { StageDirector } from "./useStageCues";
import type { WizardControls } from "./useWizard";

import { hasLook, tryOnSound, wareSpot } from "../pet/shopRitual";
import { nextMoment, TRY_ON, type StageChoice } from "../pet/shopTimeline";
import { WIZARD_HAT_KEY } from "../pet/wizardHat";
import { shopFx } from "./fx/sparksEngine";
import { shopSound } from "./sound/shopSound";

/** Was die Momente der Wahl brauchen. */
export interface MomentOptions {
  /** Die gewählte Ware, ohne Wahl `null`. */
  selected: ShopItem | null;
  me: Me;
  notice: WizardControls["notice"];
  director: StageDirector;
}

/** Was die Bühne über die Wahl weiß. Käufe zählt das Siegel. */
function choiceOf(selected: ShopItem | null, me: Me): StageChoice {
  const slot = selected?.cosmetic.slot ?? null;
  return {
    chosenId: selected?.cosmetic.id ?? null,
    slot,
    equippedKey: slot ? (me.equipped[slot]?.key ?? null) : null,
    purchases: 0,
  };
}

/** Eine Ware ohne Abbild: Der Zauber verpufft am Platz, das Pergament raschelt, die Runen ruhen. */
function unseen(item: ShopItem, { notice, director }: MomentOptions) {
  shopFx.play({ kind: "fizzle", at: wareSpot(item) });
  shopSound.cue("pageTurn");
  director.stage([{ at: 0, circle: "ruhe", dim: null }]);
  notice({ kind: "select", item });
}

/** Die Anprobe von `item`: Wirbel, Glanz bei Gekauftem, Klang, Licht, Runen und der Zauberer. */
function tryOn(item: ShopItem, options: MomentOptions) {
  if (!hasLook(item, COSMETIC_MODEL_KEYS)) return unseen(item, options);
  const { notice, director } = options;
  const at = wareSpot(item);
  shopFx.play({ kind: "swirl", at });
  if (item.state === "owned") shopFx.play({ kind: "glint", at, delayMs: TRY_ON.pop });
  shopSound.cue("tryOn", tryOnSound(item));
  director.light("tryOn");
  director.stage([{ at: 0, circle: "anprobe", dim: null }]);
  notice({ kind: "select", item });
}

/** Spielt die Momente der Wahl. */
export function useShopMoments(options: MomentOptions) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const { selected, me } = options;
  const choice = choiceOf(selected, me);
  const last = useRef(choice);
  const { chosenId } = choice;
  useEffect(() => {
    const now = choiceOf(latest.current.selected, latest.current.me);
    // Den Hut des Zauberers setzt der Server auf und nimmt ihn wieder ab: kein Anlegen, kein Ablegen.
    if (now.equippedKey === WIZARD_HAT_KEY) now.equippedKey = last.current.equippedKey;
    const moment = nextMoment(last.current, now);
    const before = last.current.chosenId;
    last.current = now;
    const item = latest.current.selected;
    if (moment === "anprobe" && item) tryOn(item, latest.current);
    else if (now.chosenId === null && before !== null) {
      latest.current.director.stage([{ at: 0, circle: "ruhe", dim: null }]);
    }
  }, [chosenId]);
}
