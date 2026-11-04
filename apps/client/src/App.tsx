/**
 * Das Pet-Fenster: Fensterknöpfe, Bühne mit Pet und Sprechblase, Panel und Dock.
 *
 * Hier wird nur zusammengesteckt. Den Spielstand und alle Backend-Aufrufe hält `usePet.ts`, die
 * Panel-Inhalte stehen in `panels/`, die 3D-Szene in `scene/`.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { desktop, resizeWindow } from "./backend";
import JoinPanel from "./panels/JoinPanel";
import LevelUpPanel from "./panels/LevelUpPanel";
import SettingsPanel from "./panels/SettingsPanel";
import XpPanel, { XP_TABS, type XpTab } from "./panels/XpPanel";
import { PREVIEW_ME, stageLayout, type Me, type Report } from "./pet";
import PetStage, { type PanelId } from "./PetStage";
import { Dock, DockButton, ErrorAlert, Panel } from "./ui";
import { usePet, usePokeKeys, useSettingDraft, type PetGame } from "./usePet";
import { PreviewFooter, PreviewHeader, WindowTools } from "./WindowChrome";

/** Ob das Betriebssystem reduzierte Bewegung wünscht. Gilt zusätzlich zur Einstellung im Pet. */
const OS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Panels im Glas-Stil. „Aussehen“, Emotes und Schilder sind keine, sie liegen direkt auf der Bühne. */
type GlassPanelId = Exclude<PanelId, "look" | "emotes" | "signs">;

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
    "--window-width": `${layout.window.width}px`,
    "--window-height": `${layout.window.height}px`,
    "--stage-height": `${layout.stage}px`,
    "--canvas-top": `${layout.canvas.top}px`,
    "--canvas-width": `${layout.canvas.width}px`,
    "--canvas-height": `${layout.canvas.height}px`,
    "--feet": `${layout.feet}px`,
    "--bubble-top": `${layout.bubbleTop}px`,
    "--tools-offset": `${layout.toolsOffset}px`,
  } as CSSProperties;
}

/** Hält das Desktop-Fenster so groß wie seinen Inhalt. Es wächst nach unten, der Kopf bleibt stehen. */
function useWindowFit(size: number) {
  const { width, height } = stageLayout(size).window;
  useEffect(() => {
    if (desktop) void resizeWindow(width, height);
  }, [width, height]);
}

/** Ob erst ein Konto oder ein Beitritt nötig ist, bevor das Pet mitspielt. */
function needsJoin({ game, ready }: PetGame) {
  if (!desktop || !ready) return false;
  return game.me === null || (game.lan.current !== null && game.lan.joined === false);
}

/**
 * Die Regler der Einstellungen: Sie zeigen sofort den neuen Wert und speichern, sobald sie ruhen.
 * Gespeichert wird immer auf den neuesten Stand, sonst überschriebe ein Regler den anderen.
 */
function useSettingSliders(game: PetGame) {
  const { settings } = game.game;
  const latest = useRef(settings);
  latest.current = settings;
  const [size, onSize] = useSettingDraft(settings.size, (next) =>
    game.saveSettings({ ...latest.current, size: next }),
  );
  const [volume, onVolume] = useSettingDraft(settings.volume, (next) =>
    game.saveSettings({ ...latest.current, volume: next }),
  );
  return { size, volume, onSize, onVolume };
}

/** Eigenschaften von {@link PanelContent}. */
interface PanelContentProps {
  panel: GlassPanelId;
  game: PetGame;
  me: Me;
  xpTab: XpTab;
  sliders: ReturnType<typeof useSettingSliders>;
  onXpTab: (tab: XpTab) => void;
  onClose: () => void;
}

/** Inhalt des offenen Panels. */
function PanelContent({ panel, game, me, xpTab, sliders, onXpTab, onClose }: PanelContentProps) {
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
      {...{ settings, ready, busy, ...sliders }}
      name={me.name}
      onReducedMotion={(reducedMotion) => void game.saveSettings({ ...settings, reducedMotion })}
      onSound={(sound) => void game.saveSettings({ ...settings, sound })}
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

/** Ob das Panel seinen Inhalt über dem Dock zeigt. */
function isGlassPanel(panel: PanelId | null): panel is GlassPanelId {
  return panel !== null && panel !== "look" && panel !== "emotes" && panel !== "signs";
}

/** Die ganze App. */
export default function App() {
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [xpTab, setXpTab] = useState<XpTab>("overview");
  const openLevelUp = useCallback(() => setPanel("levelup"), []);
  const game = usePet(openLevelUp);
  const { settings } = game.game;
  const me = game.game.me ?? PREVIEW_ME;
  const sliders = useSettingSliders(game);
  useWindowFit(sliders.size);
  const joining = needsJoin(game);
  usePokeKeys(game.interact, panel === null && !joining);

  useDocumentTheme(me.color, settings.reducedMotion || OS_REDUCED_MOTION);

  const close = useCallback(() => setPanel(null), []);
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
        style={stageStyle(sliders.size)}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <WindowTools onAction={(action) => void game.windowAction(action)} />
        <PetStage
          {...{ game, me, panel, joining }}
          reducedMotion={settings.reducedMotion || OS_REDUCED_MOTION}
          onToggle={toggle}
          onClose={close}
        />
        <section className="pet-controls" aria-label="Pet-Steuerung">
          {joining ? <JoinControls game={game} /> : null}
          {!joining && isGlassPanel(panel) ? (
            <Panel title={panelTitle(panel, xpTab, me)} onClose={close}>
              <PanelContent
                {...{ panel, game, me, xpTab, sliders, onClose: close }}
                onXpTab={setXpTab}
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
