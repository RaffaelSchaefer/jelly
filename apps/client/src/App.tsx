/**
 * Das Pet-Fenster: Fensterknöpfe, Bühne mit Pet und Sprechblase, Panel und Dock.
 *
 * Hier wird nur zusammengesteckt. Den Spielstand und alle Backend-Aufrufe hält `usePet.ts`, die
 * Panel-Inhalte stehen in `panels/`, die 3D-Szene in `scene/`.
 *
 * @module
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { desktop } from "./backend";
import JoinPanel from "./panels/JoinPanel";
import LevelUpPanel from "./panels/LevelUpPanel";
import SettingsPanel from "./panels/SettingsPanel";
import XpPanel, { XP_TABS, type XpTab } from "./panels/XpPanel";
import { PREVIEW_ME, REGIONS, stageLayout, type Me, type Report, type StudioRegionId } from "./pet";
import Studio from "./Studio";
import { Dock, DockButton, ErrorAlert, Panel, SpeechBubble } from "./ui";
import { usePet, usePokeKeys, useSizeDraft, type PetGame } from "./usePet";
import { PreviewFooter, PreviewHeader, WindowTools } from "./WindowChrome";

/** Three.js erst laden, wenn die Bühne gebraucht wird. Das hält den Start schnell. */
const PetScene = lazy(() => import("./scene/PetScene"));

/** Ob das Betriebssystem reduzierte Bewegung wünscht. Gilt zusätzlich zur Einstellung im Pet. */
const OS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Welches Panel über dem Dock offen ist. */
type PanelId = "lan" | "levelup" | "look" | "settings";

/** Panels im Glas-Stil. „Aussehen“ ist keins, das Studio liegt direkt auf der Bühne. */
type GlassPanelId = Exclude<PanelId, "look">;

/** Überschrift des offenen Panels. Beim XP-Panel setzt sie der gewählte Reiter. */
function panelTitle(panel: GlassPanelId, xpTab: XpTab, me: Me) {
  const titles: Record<GlassPanelId, string> = {
    lan: XP_TABS.find((tab) => tab.id === xpTab)!.title,
    levelup: `${me.name} ist eine Stufe weiter.`,
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

/** Ob erst ein Konto oder ein Beitritt nötig ist, bevor das Pet mitspielt. */
function needsJoin({ game, ready }: PetGame) {
  if (!desktop || !ready) return false;
  return game.me === null || (game.lan.current !== null && game.lan.joined === false);
}

/**
 * Sprechblase, das anklickbare Pet und sein Bodenschatten, mit `studio` auch das Studio.
 *
 * @param onCloseStudio - Schließt das Studio.
 */
function PetStage({
  game,
  me,
  studio,
  onCloseStudio,
}: {
  game: PetGame;
  me: Me;
  studio: boolean;
  onCloseStudio: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<StudioRegionId | null>(null);
  // Beim nächsten Öffnen soll keine Region mehr offen sein und die Kamera wieder zurückfahren.
  if (!studio && region) setRegion(null);
  return (
    <div className="pet-stage" ref={stage}>
      <SpeechBubble>{game.message}</SpeechBubble>
      <button
        className="pet-touch"
        aria-label={`${me.name} anstupsen`}
        disabled={!desktop || !game.ready || game.busy || !game.game.me}
        onClick={() => void game.interact("poke")}
      >
        <Suspense fallback={<span className="render-fallback">Dein Begleiter wacht auf …</span>}>
          <PetScene
            color={me.color}
            cosmetic={me.cosmetic}
            pulse={game.pulse}
            reducedMotion={game.game.settings.reducedMotion || OS_REDUCED_MOTION}
            focus={REGIONS.find((item) => item.id === region)?.focus}
            anchors={studio ? stage : undefined}
          />
        </Suspense>
      </button>
      {studio ? (
        <Studio
          {...{ me, region }}
          catalog={game.catalog}
          busy={game.busy || !game.ready}
          onRegion={setRegion}
          onEquip={(id) => void game.equip(id)}
          onColor={(color) => void game.customize({ color })}
          onName={(name) => game.customize({ name })}
          onClose={onCloseStudio}
        />
      ) : null}
      <div className="ground-shadow" />
      <h1 className="sr-only">
        {me.name}, Level {me.level}
      </h1>
    </div>
  );
}

/** Eigenschaften von {@link PanelContent}. */
interface PanelContentProps {
  panel: GlassPanelId;
  game: PetGame;
  me: Me;
  xpTab: XpTab;
  size: number;
  onXpTab: (tab: XpTab) => void;
  onSize: (size: number) => void;
  onClose: () => void;
}

/** Inhalt des offenen Panels. */
function PanelContent({
  panel,
  game,
  me,
  xpTab,
  size,
  onXpTab,
  onSize,
  onClose,
}: PanelContentProps) {
  const { catalog, ready, busy } = game;
  const disabled = busy || !ready;
  if (panel === "lan") {
    const report = (action: Report) => void game.interact(action);
    return (
      <XpPanel
        {...{ me, catalog, disabled }}
        offset={game.offset}
        tab={xpTab}
        onTab={onXpTab}
        onReport={report}
        onRedeem={game.redeem}
      />
    );
  }
  if (panel === "levelup") {
    const equipAndClose = (id: string) => {
      void game.equip(id);
      onClose();
    };
    return <LevelUpPanel {...{ me, catalog, disabled, onClose }} onEquip={equipAndClose} />;
  }
  const { settings } = game.game;
  return (
    <SettingsPanel
      {...{ settings, size, ready, busy, onSize }}
      name={me.name}
      onReducedMotion={(reducedMotion) => void game.saveSettings({ ...settings, reducedMotion })}
    />
  );
}

/** Die drei Dock-Knöpfe. Der XP-Knopf gilt auch für das Level-Panel als „offen“. */
function PetDock({
  me,
  panel,
  onToggle,
}: {
  me: Me;
  panel: PanelId | null;
  onToggle: (panel: PanelId) => void;
}) {
  const xpOpen = panel === "lan" || panel === "levelup";
  return (
    <Dock label="Pet-Menü">
      <DockButton
        icon="spark"
        label="XP und Fortschritt"
        title={`${me.name} · Level ${me.level} · ${me.xp} XP`}
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
      Verbinde mit dem Server …
    </p>
  );
}

/** Konto anlegen oder beitreten, statt Panels und Dock. */
function JoinControls({ game }: { game: PetGame }) {
  return (
    <Panel title="Willkommen auf der LAN.">
      <JoinPanel
        game={game.game}
        disabled={game.busy}
        onRegister={(code, name, color) => void game.register(code, name, color)}
        onJoin={(code) => void game.joinLan(code)}
      />
    </Panel>
  );
}

/** Legt Pet-Farbe und reduzierte Bewegung als Attribute auf `<html>`, `styles.css` liest sie. */
function useDocumentTheme(color: Me["color"], reducedMotion: boolean) {
  // Das UI-Theme (Akzent, Panels, Sprechblase) folgt der Farbe des Pets.
  useEffect(() => {
    document.documentElement.dataset.petColor = color;
  }, [color]);

  // CSS-Animationen sehen die Einstellung und das Betriebssystem an einem Attribut.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-reduced-motion", reducedMotion);
  }, [reducedMotion]);
}

/** Die ganze App. */
export default function App() {
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [xpTab, setXpTab] = useState<XpTab>("overview");
  const openLevelUp = useCallback(() => setPanel("levelup"), []);
  const game = usePet(openLevelUp);
  const { settings } = game.game;
  const me = game.game.me ?? PREVIEW_ME;
  const [size, changeSize] = useSizeDraft(settings.size, (next) =>
    game.saveSettings({ ...settings, size: next }),
  );
  const joining = needsJoin(game);
  usePokeKeys(game.interact, panel === null && !joining);

  useDocumentTheme(me.color, settings.reducedMotion || OS_REDUCED_MOTION);

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
        <PetStage game={game} me={me} studio={!joining && panel === "look"} onCloseStudio={close} />
        <section className="pet-controls" aria-label="Pet-Steuerung">
          {joining ? <JoinControls game={game} /> : null}
          {!joining && panel && panel !== "look" ? (
            <Panel title={panelTitle(panel, xpTab, me)} onClose={close}>
              <PanelContent
                {...{ panel, game, me, xpTab, size, onClose: close }}
                onXpTab={setXpTab}
                onSize={changeSize}
              />
            </Panel>
          ) : null}
          {joining ? null : <PetDock me={me} panel={panel} onToggle={toggle} />}
        </section>
        <Status game={game} />
      </main>
      {desktop ? null : <PreviewFooter />}
    </>
  );
}
