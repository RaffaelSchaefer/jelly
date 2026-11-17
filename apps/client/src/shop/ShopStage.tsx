/**
 * Die Ladentheke: ein Raum bei Kerzenlicht. Links sitzt der Zauberer hinter seiner Theke, rechts
 * wartet das eigene Jelly auf dem Runenkreis im Mondlicht, darüber seine Sprechblase.
 *
 * Die 3D-Szene (`scene/ShopScene.tsx`) zeichnet nur die beiden Jellies samt Kugel. Alles andere ist
 * DOM in Ebenen davor und dahinter, jede mit der Kamera aus `pet/shopStage.ts` gelegt:
 *
 * | z   | Ebene             | Inhalt                                                            |
 * | --- | ----------------- | ----------------------------------------------------------------- |
 * | 0   | `.stage-backdrop` | Himmel, Wand, Regale, Fenster, Lichtflecken, Mondfleck, Abdunkeln |
 * | 1   | `.stage-floor3d`  | Runenkreis                                                        |
 * | 2   | `.stage-scene`    | Canvas                                                            |
 * | 3   | `.stage-counter`  | Theke, Kerzen, Flammen, Schale                                    |
 * | 4   | `.stage-air`      | Mondlicht, Staub, Balken, Kräuter, Vignette                       |
 * | 5   | `.stage-signs`    | Schild „Geschlossen“, „Zur Probe“, Stupsfläche                    |
 * | 6   | `.stage-bubble`   | Sprechblase                                                       |
 *
 * Größe und Rahmen der Bühne legt der Laden fest, `--u` schreibt `useStageUnit`. Die Canvas der
 * Funken (`fx/ShopFx.tsx`) hängt die Bühne über das ganze Fenster, `--flicker` schreibt das Licht
 * der Szene. In der Vorschau spielen `#shop-anprobe` und `#shop-zauber` die Effekte von selbst
 * (`useFxReplay.ts`).
 *
 * @module
 */

import { lazy, Suspense, useRef } from "react";

import type { LightCue } from "../pet/shopLight";
import type { RuneState } from "../pet/shopStage";
import type { ShopControls } from "./useShop";
import type { WizardControls } from "./useWizard";

import { FULL_RENDERING, OPTIMIZED_RENDERING, PET_COLORS, type Equipped, type Me } from "../pet";
import { OS_REDUCED_MOTION } from "../useDocumentTheme";
import ShopFx from "./fx/ShopFx";
import RuneCircle from "./RuneCircle";
import StageAir from "./StageAir";
import StageBackdrop from "./StageBackdrop";
import StageBubble from "./StageBubble";
import StageCounter from "./StageCounter";
import StageSigns from "./StageSigns";
import { useFxReplay } from "./useFxReplay";
import { useStageUnit } from "./useStageUnit";
import "./css/room.css";
import "./css/stage.css";

/** Three.js erst laden, wenn Rolle und Siegel schon dastehen. */
const ShopScene = lazy(() => import("../scene/ShopScene"));

/** Was statt der beiden Jellies dasteht, solange Three.js lädt. */
const WAKING_UP = <span className="render-fallback">Der Zauberer schließt auf …</span>;

/** Eigenschaften von {@link ShopStage}. */
export interface ShopStageProps {
  shop: ShopControls;
  /** Der Zauberer. Die Szene bekommt alles davon, so kommen neue Eigenschaften ohne Umweg an. */
  wizard: WizardControls;
  me: Me;
  /** Was das eigene Jelly trägt, samt dem Teil zur Probe. */
  equipped: Equipped;
  /** Wie der Runenkreis leuchtet. */
  circle?: RuneState;
  /** `kauf` dunkelt den Raum hinter den Jellies ab, während der Kaufzauber wirkt. */
  dim?: "kauf" | null;
  /** Der laufende Moment fürs Licht der Szene: Anprobe, Ladung, Zauber, Fehlschlag. */
  lightCue?: LightCue | null;
}

/** Die Bühne. */
export default function ShopStage({
  shop,
  wizard,
  me,
  equipped,
  circle = "ruhe",
  dim = null,
  lightCue = null,
}: ShopStageProps) {
  const stage = useRef<HTMLElement>(null);
  useStageUnit(stage);
  const { settings } = shop.game;
  const profile = settings.optimizedRendering ? OPTIMIZED_RENDERING : FULL_RENDERING;
  const reducedMotion = settings.reducedMotion ?? OS_REDUCED_MOTION;
  // Der Kunde hüpft, wenn der Zauber einschlägt, nicht schon, wenn der Server zustimmt.
  const { emote, hops } = wizard.customer;
  const base = { equipped, circle, dim, lightCue, pulse: hops, wizardPulse: wizard.pulse };
  const show = useFxReplay(base, shop.catalog);
  // Ohne Vorschau bleibt der Zauberer dasselbe Objekt, so rechnet die Szene nichts neu.
  const keeper =
    show.wizardPulse === wizard.pulse ? wizard : { ...wizard, pulse: show.wizardPulse };
  return (
    <section
      ref={stage}
      className="shop-stage"
      aria-label="Ladentheke"
      data-dozing={wizard.dozing ? "" : undefined}
    >
      <StageBackdrop dim={show.dim} />
      <RuneCircle state={show.circle} />
      <div className="stage-scene">
        <Suspense fallback={WAKING_UP}>
          <ShopScene
            own={{ color: me.color, equipped: show.equipped, pulse: show.pulse, emote }}
            wizard={keeper}
            rendering={{ ...profile, glass: false }}
            frameLimit={settings.frameLimit}
            reducedMotion={reducedMotion}
            lightCue={show.lightCue}
            circle={show.circle}
            onReady={wizard.onSceneReady}
          />
        </Suspense>
      </div>
      <StageCounter />
      <StageAir />
      <StageSigns open={shop.open} shown={show.equipped} worn={me.equipped} />
      <StageBubble said={wizard.said} />
      <ShopFx
        frameLimit={settings.frameLimit}
        lite={settings.optimizedRendering}
        calm={reducedMotion}
        glow={PET_COLORS[me.color].glow}
      />
    </section>
  );
}
