/**
 * Die Ladentheke: links der Zauberer hinter seinem Tresen, rechts das eigene Jelly zur Anprobe,
 * dazu seine Sprechblase und die Börse in der Ecke.
 *
 * Die 3D-Szene (`scene/ShopScene.tsx`) liegt zwischen der Wand dahinter und dem Tresen davor. Beide
 * sind DOM, ihre Lage in `shop.css` folgt aus der Kamera der Szene.
 *
 * @module
 */

import { lazy, Suspense } from "react";

import type { ShopControls } from "./useShop";
import type { WizardControls } from "./useWizard";

import { coinLabel, FULL_RENDERING, OPTIMIZED_RENDERING, type Equipped, type Me } from "../pet";
import { Icon, SpeechBubble } from "../ui";
import { OS_REDUCED_MOTION } from "../useDocumentTheme";

/** Three.js erst laden, wenn Rolle und Siegel schon dastehen. */
const ShopScene = lazy(() => import("../scene/ShopScene"));

/** Was statt der beiden Jellies dasteht, solange Three.js lädt. */
const WAKING_UP = <span className="render-fallback">Der Zauberer schließt auf …</span>;

/** Die Börse oben rechts: Münzen und was ein Aufstieg bringt. */
function Purse({ coins, perLevel }: { coins: number; perLevel: number }) {
  return (
    <p className="stage-purse" role="status">
      <Icon name="coin" />
      <strong>{coinLabel(coins)}</strong>
      {perLevel > 0 ? <small>+{perLevel} je Level</small> : null}
    </p>
  );
}

/**
 * Die Bühne.
 *
 * @param equipped - Was das eigene Jelly trägt, samt dem Teil zur Probe.
 */
export default function ShopStage({
  shop,
  wizard,
  me,
  equipped,
}: {
  shop: ShopControls;
  wizard: WizardControls;
  me: Me;
  equipped: Equipped;
}) {
  const { settings, lan } = shop.game;
  const profile = settings.optimizedRendering ? OPTIMIZED_RENDERING : FULL_RENDERING;
  const { said } = wizard;
  return (
    <section className="shop-stage" aria-label="Ladentheke">
      <div className="stage-wall" aria-hidden="true">
        <span className="stage-shelf" />
        <span className="stage-rug" />
      </div>
      <div className="stage-scene">
        <Suspense fallback={WAKING_UP}>
          <ShopScene
            own={{ color: me.color, equipped, pulse: shop.pulse }}
            wizard={{ emote: wizard.emote, voiced: wizard.voiced, dozing: wizard.dozing }}
            rendering={{ ...profile, glass: false }}
            frameLimit={settings.frameLimit}
            reducedMotion={settings.reducedMotion ?? OS_REDUCED_MOTION}
          />
        </Suspense>
      </div>
      <div className="stage-counter" aria-hidden="true">
        <span className="stage-candle" />
      </div>
      <div className="stage-bubble">
        {/* Immer da: Screenreader lesen nur Änderungen in einer Meldung vor, die schon stand. */}
        <SpeechBubble text={said?.line.text ?? ""} saidAt={said?.at} hidden={!said} />
      </div>
      <Purse coins={me.coins} perLevel={lan.rules.coins_per_level} />
    </section>
  );
}
