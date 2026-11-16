/**
 * Das Jelly, seine kurze Emote-Anzeige und die Bedienung direkt an der Szene.
 *
 * @module
 */

import { EMOTE_GLYPHS, isEmoteKey } from "@jelly/scene/emotes";
import { isPartnerMotionKey } from "@jelly/scene/partner-emotes";
import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from "react";

import type { ActiveEmote } from "./useEmotes";
import type { PetGame } from "./usePet";

import { desktop } from "./backend";
import EmotePicker from "./EmotePicker";
import Hatch, { useHatchWave } from "./Hatch";
import LevelUp, { useCelebration } from "./LevelUp";
import MapDrop from "./MapDrop";
import {
  hatchesNew,
  REGIONS,
  signLabel,
  wearingLevelReward,
  type Me,
  type PetColor,
  type RenderProfile,
  type StudioRegionId,
  type CameraFocus,
} from "./pet";
import SignPicker from "./SignPicker";
import Studio from "./Studio";
import { SpeechBubble } from "./ui";
import { useJellyVoice, type ActiveVoice } from "./useJellyVoice";

/** Three.js erst laden, wenn die Bühne gebraucht wird. */
const PetScene = lazy(() => import("./scene/PetScene"));

/** So lange wartet das Jelly höchstens auf die gespeicherten Einstellungen, in Millisekunden. */
const SETTINGS_WAIT_MS = 1500;

/** Welches Panel über dem Dock oder direkt am Jelly offen ist. */
export type PanelId = "lan" | "levelup" | "look" | "settings" | "emotes" | "signs";

/** Vorübergehende Anzeige, ohne die letzte Fortschrittsmeldung zu überschreiben. */
function emoteMessage(emote: ActiveEmote | null) {
  if (!emote) return null;
  return isEmoteKey(emote.key) ? `${EMOTE_GLYPHS[emote.key]} ${emote.label}` : emote.label;
}

/** Ob gerade ein Partner-Emote läuft: zu zweit, allein oder gar nicht. Steuert `styles.css`. */
function duetMode(emote: ActiveEmote | null) {
  if (!emote || !isPartnerMotionKey(emote.key)) return;
  return emote.partner ? "pair" : "solo";
}

/**
 * Welche Bedienung direkt am Jelly sichtbar ist.
 *
 * @param hatch - Ob der Einstieg läuft, samt dem Schlüpfen danach. Dann gibt es nichts anderes.
 */
function stageModes(panel: PanelId | null, hatch: boolean) {
  const dropsVisible = !hatch && (panel === null || panel === "emotes" || panel === "signs");
  const studio = !hatch && panel === "look";
  const levelUp = !hatch && panel === "levelup";
  return {
    hatch,
    studio,
    levelUp,
    dropsVisible,
    // Wo Glas liegt, braucht es die Lage des Jellys und die Flächen aus dem DOM.
    glass: hatch || studio || levelUp || dropsVisible,
    // Die Säule der Schilder bräuchte den Platz. In den anderen Fällen läuft das Glas gar nicht.
    bubble: hatch || (dropsVisible && panel !== "signs"),
  };
}

/** Worauf die Kamera fährt. Beim Schlüpfen bleibt sie stehen, wo der Einstieg sie hingefahren hat. */
function cameraFocus(hatch: boolean, levelUp: boolean, region: StudioRegionId | null) {
  if (hatch) return "hatch";
  return levelUp ? "levelup" : REGIONS.find((item) => item.id === region)?.focus;
}

/** Eigenschaften der Bühne samt ihrer Overlays. */
interface PetStageProps {
  game: PetGame;
  me: Me;
  panel: PanelId | null;
  /** Erst ein Code ist nötig: Am Jelly läuft nur der Einstieg. */
  joining: boolean;
  /** Die Farbe im Entwurf, solange es noch kein Konto gibt. */
  joinColor: PetColor;
  onJoinColor: (color: PetColor) => void;
  /** Wird gerufen, wenn das Gerät zu langsam ist. Ohne Wert wird nicht gemessen. */
  onSlowDevice?: () => void;
  reducedMotion: boolean;
  /** Wie aufwendig die Szene gezeichnet wird. */
  rendering: RenderProfile;
  /** Bilder pro Sekunde, `null` heißt unbegrenzt. */
  frameLimit: number | null;
  onToggle: (panel: PanelId) => void;
  onClose: () => void;
}

/**
 * Ob die Szene starten darf. Erst der geladene Stand sagt, welcher Modus gilt: Sonst kompilierte
 * ein alter PC bei jedem Start die teuren Shader, die ihm der optimierte Modus ersparen soll. Ein
 * hängender Server hält das Jelly trotzdem nicht auf.
 *
 * @param settled - Ob der Stand geladen ist oder das Laden gescheitert.
 */
function useSceneStart(settled: boolean) {
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), SETTINGS_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return settled || waited;
}

/** Was statt des Jellys dasteht, solange es noch nicht gezeichnet wird. */
const WAKING_UP = <span className="render-fallback">Dein Begleiter wacht auf …</span>;

/** Das anklickbare Jelly mit verzögert geladener Canvas. */
function PetVisual({
  game,
  me,
  reducedMotion,
  rendering,
  frameLimit,
  sign,
  emote,
  equipped,
  voiced,
  focus,
  anchors,
  onSlowDevice,
}: {
  game: PetGame;
  me: Me;
  reducedMotion: boolean;
  rendering: RenderProfile;
  frameLimit: number | null;
  sign: string | null;
  emote: ActiveEmote | null;
  equipped: Me["equipped"];
  voiced: RefObject<ActiveVoice | null>;
  focus?: CameraFocus;
  anchors?: RefObject<HTMLElement | null>;
  onSlowDevice?: () => void;
}) {
  const started = useSceneStart(game.ready || game.error !== "");
  return (
    <button
      className="pet-touch"
      aria-label={`${me.name} anstupsen`}
      // Das Jelly antwortet selbst mit seiner Stimme.
      data-sound="none"
      disabled={!desktop || !game.ready || game.busy || !game.game.me}
      onClick={() => void game.interact("poke")}
    >
      <Suspense fallback={WAKING_UP}>
        {started ? (
          <PetScene
            color={me.color}
            pulse={game.pulse}
            {...{ emote, equipped, reducedMotion, rendering, frameLimit, sign, voiced }}
            {...{ focus, anchors, onSlowDevice }}
          />
        ) : (
          WAKING_UP
        )}
      </Suspense>
    </button>
  );
}

/**
 * Die Tropfen am Jelly. Die Reihenfolge ist auch die der Flächen im Shader: Die Emotes bleiben für
 * sich, das Schild fließt mit seinen Kapseln zusammen (siehe `scene/LiquidGlass.tsx`).
 */
function StageDrops({
  game,
  me,
  panel,
  onToggle,
  onClose,
  onPreview,
}: Pick<PetStageProps, "game" | "me" | "panel" | "onToggle" | "onClose"> & {
  onPreview: (key: string | null) => void;
}) {
  return (
    <>
      <EmotePicker
        entries={game.catalog.emotes}
        open={panel === "emotes"}
        disabled={game.emotesDisabled}
        onToggle={() => onToggle("emotes")}
        onClose={onClose}
        onPick={game.playEmote}
      />
      <MapDrop
        disabled={!game.ready || game.incoming !== null}
        onOpen={() => void game.openMap()}
      />
      <SignPicker
        catalog={game.catalog}
        current={me.sign}
        open={panel === "signs"}
        allowed={game.signsAllowed}
        disabled={game.signsDisabled}
        onToggle={() => onToggle("signs")}
        onClose={onClose}
        onPick={game.setSign}
        onPreview={onPreview}
      />
    </>
  );
}

/**
 * Die Sprechblase: Während einer Geste steht dort ihr Name, sonst die letzte Meldung. Sie steht im
 * DOM nach den Tropfen, denn die Emotes brauchen die ersten beiden Plätze im Shader für sich.
 */
function StageBubble({ game, saidAt, hidden }: { game: PetGame; saidAt: number; hidden: boolean }) {
  const gesture = emoteMessage(game.activeEmote);
  return (
    <SpeechBubble
      text={gesture ?? game.message}
      saidAt={gesture ? undefined : saidAt}
      hidden={hidden}
    />
  );
}

/** Das Studio mit den Aktionen des Spielstands. */
function StudioOverlay({
  game,
  me,
  region,
  onRegion,
  onClose,
}: {
  game: PetGame;
  me: Me;
  region: StudioRegionId | null;
  onRegion: (region: StudioRegionId | null) => void;
  onClose: () => void;
}) {
  return (
    <Studio
      {...{ me, region, onRegion, onClose }}
      catalog={game.catalog}
      busy={game.busy || !game.ready}
      onEquip={(slot, id) => void game.equip(slot, id)}
      onColor={(color) => void game.customize({ color })}
      onName={(name) => game.customize({ name })}
    />
  );
}

/** Der Aufstieg mit den Aktionen des Spielstands. Ein weiteres Level spielt ihn noch einmal ab. */
function LevelUpOverlay({ game, me, onClose }: { game: PetGame; me: Me; onClose: () => void }) {
  return (
    <LevelUp
      key={me.level}
      {...{ me, onClose }}
      catalog={game.catalog}
      rules={game.game.lan.rules}
      disabled={game.busy || !game.ready}
      onEquip={(item) => {
        void game.equip(item.slot, item.id);
        onClose();
      }}
    />
  );
}

/**
 * Was das Jelly zur Probe auf der Tafel zeigt. Ohne offene Auswahl gibt es keine Probe: Auch ein
 * Level-up kann sie schließen, und das Verlassen der Säule käme dann nie an.
 */
function useSignPreview(open: boolean) {
  const [preview, setPreview] = useState<string | null>(null);
  if (!open && preview !== null) setPreview(null);
  return [preview, setPreview] as const;
}

/** Das gerade zugängliche Overlay am Jelly. */
function StageOverlays({
  modes,
  region,
  onRegion,
  onPreview,
  joinColor,
  onJoinColor,
  ...props
}: Pick<
  PetStageProps,
  "game" | "me" | "panel" | "joinColor" | "onJoinColor" | "onToggle" | "onClose"
> & {
  modes: ReturnType<typeof stageModes>;
  region: StudioRegionId | null;
  onRegion: (region: StudioRegionId | null) => void;
  onPreview: (key: string | null) => void;
}) {
  const { game, me, onClose } = props;
  return (
    <>
      {modes.studio ? <StudioOverlay {...{ game, me, region, onRegion, onClose }} /> : null}
      {modes.levelUp ? <LevelUpOverlay {...{ game, me, onClose }} /> : null}
      {modes.hatch ? <Hatch game={game} color={joinColor} onColor={onJoinColor} /> : null}
      {modes.dropsVisible ? <StageDrops {...props} onPreview={onPreview} /> : null}
    </>
  );
}

/** Die Überschrift für Screenreader. Ein neues Jelly hat noch keinen Namen und kein Level. */
function stageTitle(me: Me, isNew: boolean) {
  return isNew ? "Dein neuer Begleiter" : `${me.name}, Level ${me.level}`;
}

/** Sprechblase, Jelly und das gerade zugängliche Overlay. */
export default function PetStage(props: PetStageProps) {
  const { game, me, panel, joining, reducedMotion, rendering, frameLimit, onToggle, onClose } =
    props;
  const { joinColor, onJoinColor } = props;
  const stage = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<StudioRegionId | null>(null);
  const [preview, setPreview] = useSignPreview(panel === "signs");
  const modes = stageModes(panel, joining || game.hatching);
  const { hatch, studio, levelUp, glass, bubble } = modes;
  const { saidAt, voiced } = useJellyVoice(game);
  const { cheer, revealed } = useCelebration(levelUp || game.hatching);
  const wave = useHatchWave(joining);
  // Beim nächsten Öffnen soll keine Region mehr offen sein und die Kamera wieder zurückfahren.
  if (!studio && region) setRegion(null);
  return (
    <div className="pet-stage" ref={stage} data-duet={duetMode(game.activeEmote)}>
      <PetVisual
        {...{ game, me, reducedMotion, rendering, frameLimit, voiced }}
        sign={studio ? null : signLabel(preview ?? me.sign, game.catalog)}
        emote={game.activeEmote ?? cheer ?? wave}
        // Nur beim Aufstieg: Zum Schlüpfen trägt es, was es hat, auch auf einem höheren Level.
        equipped={revealed && levelUp ? wearingLevelReward(me, game.catalog) : me.equipped}
        focus={cameraFocus(hatch, levelUp, region)}
        anchors={glass ? stage : undefined}
        onSlowDevice={props.onSlowDevice}
      />
      <StageOverlays
        {...{ game, me, panel, modes, region, joinColor, onJoinColor, onToggle, onClose }}
        onRegion={setRegion}
        onPreview={setPreview}
      />
      <StageBubble {...{ game, saidAt }} hidden={!bubble} />
      <div className="ground-shadow" />
      <h1 className="sr-only">{stageTitle(me, hatchesNew(game.game))}</h1>
    </div>
  );
}
