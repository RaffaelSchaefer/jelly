/**
 * Das Pet-Fenster: Fensterknöpfe, Bühne mit Pet und Sprechblase, Panel und Dock.
 *
 * Hier wird nur zusammengesteckt. Den Spielstand und alle Backend-Aufrufe hält `usePet.ts`, die
 * Panel-Inhalte stehen in `panels/`, die 3D-Szene in `scene/`.
 *
 * @module
 */

import { isPartnerMotionKey } from "@jelly/scene/partner-emotes";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { desktop, resizeWindow } from "./backend";
import PartnerInvitePopup from "./panels/PartnerInvitePopup";
import SettingsPanel from "./panels/SettingsPanel";
import XpPanel, { XP_TABS, type XpTab } from "./panels/XpPanel";
import {
  frameLimitToStop,
  FULL_RENDERING,
  needsCode,
  OPTIMIZED_RENDERING,
  PREVIEW_ME,
  stageLayout,
  stopToFrameLimit,
  type Me,
  type PetColor,
  type Report,
} from "./pet";
import PetStage, { type PanelId } from "./PetStage";
import { Dock, DockButton, ErrorAlert, Panel } from "./ui";
import { usePet, usePokeKeys, useSettingDraft, type PetGame } from "./usePet";
import { useUiSounds } from "./useUiSounds";
import { PreviewFooter, PreviewHeader, WindowTools } from "./WindowChrome";
import "./optimized.css";

/**
 * Ob das Betriebssystem reduzierte Bewegung wünscht. Gilt, solange die Einstellung im Pet nicht
 * gesetzt ist.
 */
const OS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Panels im Glas-Stil. „Aussehen“, Emotes, Schilder und der Aufstieg liegen direkt auf der Bühne. */
type GlassPanelId = Exclude<PanelId, "look" | "emotes" | "signs" | "levelup">;

/** Überschrift des offenen Panels. Bei XP setzt sie der gewählte Reiter. */
function panelTitle(panel: GlassPanelId, xpTab: XpTab) {
  const titles: Record<GlassPanelId, string> = {
    lan: XP_TABS.find((tab) => tab.id === xpTab)!.title,
    settings: "Ein bisschen Feintuning.",
  };
  return titles[panel];
}

/** Die Bühnengeometrie als CSS-Variablen für `.pet-window` (siehe `styles.css`). */
export function stageStyle(size: number) {
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

/** Ob erst ein Code nötig ist, bevor das Pet mitspielt. Die Vorschau kommt per Hash dorthin. */
function needsJoin({ game, ready }: PetGame) {
  return ready && needsCode(game);
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
  const [frameStop, onFrameStop] = useSettingDraft(frameLimitToStop(settings.frameLimit), (next) =>
    game.saveSettings({ ...latest.current, frameLimit: stopToFrameLimit(next) }),
  );
  return { size, volume, frameStop, onSize, onVolume, onFrameStop };
}

/** Eigenschaften von {@link PanelContent}. */
interface PanelContentProps {
  panel: GlassPanelId;
  game: PetGame;
  me: Me;
  xpTab: XpTab;
  sliders: ReturnType<typeof useSettingSliders>;
  /** Wirksame Einstellung „Weniger Bewegung“: die eigene oder die des Betriebssystems. */
  reducedMotion: boolean;
  onXpTab: (tab: XpTab) => void;
  onClose: () => void;
}

/** Inhalt des offenen Panels. */
function PanelContent(props: PanelContentProps) {
  const { panel, game, me, xpTab, sliders, reducedMotion, onXpTab } = props;
  const { catalog, ready, busy } = game;
  const disabled = busy || !ready;
  if (panel === "lan") {
    const report = (action: Report) => void game.interact(action);
    return (
      <XpPanel
        {...{ me, catalog, disabled }}
        rules={game.game.lan.rules}
        offset={game.offset}
        tab={xpTab}
        onTab={onXpTab}
        onReport={report}
        onRedeem={game.redeem}
      />
    );
  }
  const { settings } = game.game;
  return (
    <SettingsPanel
      {...{ settings, reducedMotion, ready, busy, ...sliders }}
      name={me.name}
      onReducedMotion={(reducedMotion) => void game.saveSettings({ ...settings, reducedMotion })}
      onOptimizedRendering={(optimizedRendering) =>
        void game.saveSettings({ ...settings, optimizedRendering })
      }
      onSound={(sound) => void game.saveSettings({ ...settings, sound })}
    />
  );
}

/** Die Dock-Knöpfe. */
function PetDock({
  me,
  panel,
  onToggle,
}: {
  me: Me;
  panel: PanelId | null;
  onToggle: (panel: PanelId) => void;
}) {
  return (
    <Dock label="Pet-Menü">
      <DockButton
        icon="spark"
        label="XP und Fortschritt"
        title={`${me.name} · Level ${me.level} · ${me.xp} XP`}
        expanded={panel === "lan"}
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

/**
 * Fehlermeldung oder Ladehinweis unter dem Dock. Scheitert das Laden, gibt es einen Neuversuch.
 * Beim Einstieg sagt das Jelly die Fehlermeldung selbst. Für Screenreader bleibt sie hier stehen:
 * Kommt derselbe Fehler noch einmal, ändert sich die Sprechblase nicht und niemand liest sie vor.
 */
function Status({ game, joining }: { game: PetGame; joining: boolean }) {
  if (joining) {
    return (
      <p className="sr-only" role="alert">
        {game.error}
      </p>
    );
  }
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

/**
 * Legt Pet-Farbe, reduzierte Bewegung und den optimierten Modus als Attribute auf `<html>`. Das CSS
 * liest sie.
 */
function useDocumentTheme(color: Me["color"], reducedMotion: boolean, optimized: boolean) {
  // Das UI-Theme (Akzent, Panels, Sprechblase) folgt der Farbe des Pets.
  useEffect(() => {
    document.documentElement.dataset.petColor = color;
  }, [color]);

  // CSS-Animationen sehen die Einstellung und das Betriebssystem an einem Attribut.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-reduced-motion", reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-optimized-rendering", optimized);
  }, [optimized]);
}

/** Ob das Panel seinen Inhalt über dem Dock zeigt. */
function isGlassPanel(panel: PanelId | null): panel is GlassPanelId {
  return panel === "lan" || panel === "settings";
}

/** Was über dem Dock steht: eine Aufforderung oder das offene Panel. Beim Einstieg nichts. */
function OverDock({
  panel,
  joining,
  ...content
}: Omit<PanelContentProps, "panel"> & { panel: PanelId | null; joining: boolean }) {
  const { game, xpTab, onClose } = content;
  if (joining || game.hatching) return null;
  // Vor dem Panel: Eine Aufforderung läuft ab, das Panel kann warten.
  if (game.incoming) {
    return (
      <PartnerInvitePopup
        incoming={game.incoming}
        disabled={game.partnerDisabled}
        onAnswer={(accepted) => void game.answerInvite(accepted)}
      />
    );
  }
  if (!isGlassPanel(panel)) return null;
  return (
    <Panel title={panelTitle(panel, xpTab)} onClose={onClose}>
      <PanelContent panel={panel} {...content} />
    </Panel>
  );
}

/** Panel und Aufstieg verdecken das Jelly: Sonst sähe man vom Partner-Emote nichts. */
function useDuetClosesPanel(game: PetGame, panel: PanelId | null, close: () => void) {
  const duet = game.activeEmote !== null && isPartnerMotionKey(game.activeEmote.key);
  const panelOpen = isGlassPanel(panel) || panel === "levelup";
  useEffect(() => {
    if (duet && panelOpen) close();
  }, [duet, panelOpen, close]);
}

/**
 * Beim Einstieg schaltet ein zu langsames Gerät von selbst auf den optimierten Modus: An die
 * Einstellungen kommt es erst danach, und wer bei 5 FPS seinen Namen tippt, gibt vielleicht vorher
 * auf. Nur hier, nicht beim Schlüpfen: Dessen Licht darf ein Gerät kurz ins Stocken bringen.
 *
 * @returns Für die Szene. Ohne Wert misst sie nicht.
 */
function useSlowDeviceSwitch({ game, saveSettings }: PetGame, joining: boolean) {
  const { settings } = game;
  const onSlow = useCallback(
    () => void saveSettings({ ...settings, optimizedRendering: true }),
    [saveSettings, settings],
  );
  return joining && !settings.optimizedRendering ? onSlow : undefined;
}

/**
 * Was beim Start offen ist. In der Vorschau gibt es keine XP, `#levelup` zeigt den Aufstieg
 * trotzdem.
 */
const FIRST_PANEL: PanelId | null = !desktop && location.hash === "#levelup" ? "levelup" : null;

/** Die ganze App. */
export default function App() {
  const [panel, setPanel] = useState<PanelId | null>(FIRST_PANEL);
  const [xpTab, setXpTab] = useState<XpTab>("overview");
  const openLevelUp = useCallback(() => setPanel("levelup"), []);
  const game = usePet(openLevelUp);
  const { settings } = game.game;
  const reducedMotion = settings.reducedMotion ?? OS_REDUCED_MOTION;
  const [joinColor, setJoinColor] = useState<PetColor>("mint");
  // Ohne Konto zeigt die Bühne das Jelly im Entwurf: Die Farbe wirkt schon vor dem Einlösen.
  const me = game.game.me ?? { ...PREVIEW_ME, name: "Dein Begleiter", color: joinColor };
  const sliders = useSettingSliders(game);
  useWindowFit(sliders.size);
  const joining = needsJoin(game);
  usePokeKeys(game.interact, panel === null && !joining && !game.hatching);

  useDocumentTheme(me.color, reducedMotion, settings.optimizedRendering);
  useUiSounds(game);

  const close = useCallback(() => setPanel(null), []);
  useDuetClosesPanel(game, panel, close);
  const onSlowDevice = useSlowDeviceSwitch(game, joining);
  const toggle = (next: PanelId) => setPanel((current) => (current === next ? null : next));

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
          {...{ game, me, panel, joining, joinColor, onSlowDevice }}
          onJoinColor={setJoinColor}
          reducedMotion={reducedMotion}
          rendering={settings.optimizedRendering ? OPTIMIZED_RENDERING : FULL_RENDERING}
          frameLimit={stopToFrameLimit(sliders.frameStop)}
          onToggle={toggle}
          onClose={close}
        />
        <section className="pet-controls" aria-label="Pet-Steuerung">
          <OverDock
            {...{ panel, joining, game, me, xpTab, sliders, reducedMotion, onClose: close }}
            onXpTab={setXpTab}
          />
          {/* Beim Einstieg und beim Aufstieg steht eine Kapsel an der Stelle des Docks. */}
          {joining || game.hatching || panel === "levelup" ? null : (
            <PetDock me={me} panel={panel} onToggle={toggle} />
          )}
        </section>
        <Status game={game} joining={joining} />
      </main>
      {desktop ? null : <PreviewFooter />}
    </>
  );
}
