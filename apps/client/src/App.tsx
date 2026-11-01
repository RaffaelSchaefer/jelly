/**
 * Das Pet-Fenster: Fensterknöpfe, Bühne mit Pet und Sprechblase, Panel und Dock.
 *
 * Hier wird nur zusammengesteckt. Den Spielstand und alle Backend-Aufrufe hält `usePet.ts`, die
 * Panel-Inhalte stehen in `panels/`, die 3D-Szene in `scene/`.
 *
 * @module
 */

import { lazy, Suspense, useCallback, useEffect, useState, type CSSProperties } from "react";

import { desktop, type WindowAction } from "./backend";
import AppearancePanel from "./panels/AppearancePanel";
import LevelUpPanel from "./panels/LevelUpPanel";
import SettingsPanel from "./panels/SettingsPanel";
import XpPanel, { XP_TABS, type XpTab } from "./panels/XpPanel";
import {
  appearanceOf,
  levelProgress,
  stageLayout,
  type Appearance,
  type Pet,
  type Report,
} from "./pet";
import { Dock, DockButton, ErrorAlert, IconButton, Panel, SpeechBubble } from "./ui";
import { usePet, usePokeKeys, useSizeDraft, type PetGame } from "./usePet";

/** Three.js erst laden, wenn die Bühne gebraucht wird. Das hält den Start schnell. */
const PetScene = lazy(() => import("./scene/PetScene"));

/** Ob das Betriebssystem reduzierte Bewegung wünscht. Gilt zusätzlich zur Einstellung im Pet. */
const OS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Welches Panel über dem Dock offen ist. */
type PanelId = "lan" | "levelup" | "look" | "settings";

/** Überschrift des offenen Panels. Beim XP-Panel setzt sie der gewählte Reiter. */
function panelTitle(panel: PanelId, xpTab: XpTab, pet: Pet) {
  const titles: Record<PanelId, string> = {
    lan: XP_TABS.find((tab) => tab.id === xpTab)!.title,
    levelup: `${pet.name} ist eine Stufe weiter.`,
    look: "Ganz dein Begleiter.",
    settings: "Ein bisschen Feintuning.",
  };
  return titles[panel];
}

/** Die Bühnengeometrie als CSS-Variablen für `.pet-window` (siehe `styles.css`). */
function stageStyle(size: number) {
  const layout = stageLayout(size);
  return {
    "--pet-scale": layout.scale,
    "--stage-height": `${layout.stage}px`,
    "--canvas-top": `${layout.canvas.top}px`,
    "--canvas-width": `${layout.canvas.width}px`,
    "--canvas-height": `${layout.canvas.height}px`,
    "--feet": `${layout.feet}px`,
    "--bubble-top": `${layout.bubbleTop}px`,
    "--tools-offset": `${layout.toolsOffset}px`,
  } as CSSProperties;
}

/** Kopfzeile, die nur in der Browser-Vorschau erscheint. */
function PreviewHeader() {
  return (
    <header className="preview-header">
      <img src="/pet.svg" width="32" height="32" alt="" />
      <div>
        <strong>Jelly</strong>
        <span>Umwelt-Campus Birkenfeld · November 2026</span>
      </div>
      <span className="preview-label">Browser-Vorschau</span>
    </header>
  );
}

/** Fußzeile, die nur in der Browser-Vorschau erscheint. */
function PreviewFooter() {
  return (
    <footer className="preview-footer">
      <span className="status-dot" />
      Oberflächen-Vorschau · Starte <code>pnpm run tauri dev</code> für das Desktop-Pet.
    </footer>
  );
}

/** Verschiebe-Griff links, Minimieren und Schließen rechts. In der Vorschau gesperrt. */
function WindowTools({ onAction }: { onAction: (action: WindowAction) => void }) {
  return (
    <div className="window-tools">
      <IconButton
        icon="drag"
        label="Pet-Fenster verschieben"
        className="drag-handle"
        title={desktop ? "Fenster verschieben" : "Im Desktop-Modus verschiebbar"}
        disabled={!desktop}
        onPointerDown={(event) => {
          if (event.button === 0) onAction("drag");
        }}
      />
      <div className="window-tools-right">
        <IconButton
          icon="minus"
          label="Minimieren"
          disabled={!desktop}
          onClick={() => onAction("minimize")}
        />
        <IconButton
          icon="close"
          label="Schließen"
          disabled={!desktop}
          onClick={() => onAction("close")}
        />
      </div>
    </div>
  );
}

/** Sprechblase, das anklickbare Pet und sein Bodenschatten. */
function PetStage({ game }: { game: PetGame }) {
  const { pet } = game;
  return (
    <div className="pet-stage">
      <SpeechBubble>{game.message}</SpeechBubble>
      <button
        className="pet-touch"
        aria-label={`${pet.name} anstupsen`}
        disabled={!desktop || !game.ready || game.busy}
        onClick={() => void game.interact("activity")}
      >
        <Suspense fallback={<span className="render-fallback">Dein Begleiter wacht auf …</span>}>
          <PetScene
            color={pet.color}
            cosmetic={pet.cosmetic}
            pulse={game.pulse}
            reducedMotion={pet.reducedMotion || OS_REDUCED_MOTION}
          />
        </Suspense>
      </button>
      <div className="ground-shadow" />
      <h1 className="sr-only">
        {pet.name}, Level {levelProgress(pet.xp).level}
      </h1>
    </div>
  );
}

/** Inhalt des offenen Panels. */
function PanelContent({
  panel,
  game,
  xpTab,
  size,
  onXpTab,
  onSize,
  onClose,
}: {
  panel: PanelId;
  game: PetGame;
  xpTab: XpTab;
  size: number;
  onXpTab: (tab: XpTab) => void;
  onSize: (size: number) => void;
  onClose: () => void;
}) {
  const { pet, ready, busy } = game;
  const equip = (id: string | null) => void game.equip(id);
  const customize = (appearance: Appearance) => void game.customize(appearance);
  if (panel === "lan") {
    const report = (action: Report) => void game.interact(action);
    return (
      <XpPanel
        {...{ pet, ready, busy }}
        tab={xpTab}
        onTab={onXpTab}
        onReport={report}
        onEquip={equip}
      />
    );
  }
  if (panel === "levelup") {
    const equipAndClose = (id: string) => {
      equip(id);
      onClose();
    };
    return (
      <LevelUpPanel pet={pet} disabled={busy || !ready} onEquip={equipAndClose} onClose={onClose} />
    );
  }
  if (panel === "look") {
    return (
      <AppearancePanel key={pet.name} pet={pet} disabled={busy || !ready} onSave={customize} />
    );
  }
  return (
    <SettingsPanel
      {...{ pet, size, ready, busy, onSize }}
      onReducedMotion={(reducedMotion) => customize({ ...appearanceOf(pet), reducedMotion })}
    />
  );
}

/** Die drei Dock-Knöpfe. Der XP-Knopf gilt auch für das Level-Panel als „offen“. */
function PetDock({
  pet,
  panel,
  onToggle,
}: {
  pet: Pet;
  panel: PanelId | null;
  onToggle: (panel: PanelId) => void;
}) {
  const xpOpen = panel === "lan" || panel === "levelup";
  return (
    <Dock label="Pet-Menü">
      <DockButton
        icon="spark"
        label="XP und Fortschritt"
        title={`${pet.name} · Level ${levelProgress(pet.xp).level} · ${pet.xp} XP`}
        expanded={xpOpen}
        onClick={() => onToggle("lan")}
      />
      <DockButton
        icon="palette"
        label="Aussehen"
        title="Aussehen"
        expanded={panel === "look"}
        onClick={() => onToggle("look")}
      />
      <DockButton
        icon="settings"
        label="Einstellungen"
        title="Einstellungen"
        expanded={panel === "settings"}
        onClick={() => onToggle("settings")}
      />
    </Dock>
  );
}

/** Fehlermeldung oder Ladehinweis unter dem Dock. Scheitert das Laden, gibt es einen Neuversuch. */
function Status({ game }: { game: PetGame }) {
  if (game.error) {
    const retry = game.ready ? undefined : () => void game.load();
    return <ErrorAlert message={game.error} onRetry={retry} />;
  }
  if (game.ready) return null;
  return (
    <p className="loading" role="status">
      Spielstand wird geladen …
    </p>
  );
}

/** Die ganze App. */
export default function App() {
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [xpTab, setXpTab] = useState<XpTab>("overview");
  const openLevelUp = useCallback(() => setPanel("levelup"), []);
  const game = usePet(openLevelUp);
  const { pet } = game;
  const [size, changeSize] = useSizeDraft(pet.size, (next) =>
    game.customize({ ...appearanceOf(pet), size: next }),
  );
  usePokeKeys(game.interact, panel === null);

  // Das UI-Theme (Akzent, Panels, Sprechblase) folgt der Farbe des Pets.
  useEffect(() => {
    document.documentElement.dataset.petColor = pet.color;
  }, [pet.color]);

  const close = () => setPanel(null);
  // Das Level-Panel gehört zum XP-Knopf: Der schließt es auch.
  const toggle = (next: PanelId) =>
    setPanel((current) =>
      current === next || (current === "levelup" && next === "lan") ? null : next,
    );

  return (
    <>
      {desktop ? null : <PreviewHeader />}
      <main
        className="pet-window"
        aria-label="Dein LAN-Begleiter"
        style={stageStyle(size)}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <WindowTools onAction={(action) => void game.windowAction(action)} />
        <PetStage game={game} />
        <section className="pet-controls" aria-label="Pet-Steuerung">
          {panel ? (
            <Panel title={panelTitle(panel, xpTab, pet)} onClose={close}>
              <PanelContent
                panel={panel}
                game={game}
                xpTab={xpTab}
                size={size}
                onXpTab={setXpTab}
                onSize={changeSize}
                onClose={close}
              />
            </Panel>
          ) : null}
          <PetDock pet={pet} panel={panel} onToggle={toggle} />
        </section>
        <Status game={game} />
      </main>
      {desktop ? null : <PreviewFooter />}
    </>
  );
}
