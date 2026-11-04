/**
 * Das Jelly, seine kurze Emote-Anzeige und die Bedienung direkt an der Szene.
 *
 * @module
 */

import { EMOTE_GLYPHS, isEmoteKey } from "@jelly/scene/emotes";
import { isPartnerMotionKey } from "@jelly/scene/partner-emotes";
import { lazy, Suspense, useRef, useState, type RefObject } from "react";

import type { ActiveEmote } from "./useEmotes";
import type { PetGame } from "./usePet";

import { desktop } from "./backend";
import EmotePicker from "./EmotePicker";
import MapDrop from "./MapDrop";
import { REGIONS, signLabel, type Me, type StudioRegionId, type StudioFocus } from "./pet";
import SignPicker from "./SignPicker";
import Studio from "./Studio";
import { SpeechBubble } from "./ui";
import { useJellyVoice, type ActiveVoice } from "./useJellyVoice";

/** Three.js erst laden, wenn die Bühne gebraucht wird. */
const PetScene = lazy(() => import("./scene/PetScene"));

/** Welches Panel über dem Dock oder direkt am Jelly offen ist. */
export type PanelId = "lan" | "levelup" | "look" | "settings" | "emotes" | "signs" | "follow";

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

/** Welche Bedienung direkt am Jelly sichtbar ist. */
function stageModes(panel: PanelId | null, joining: boolean) {
  const dropsVisible = !joining && (panel === null || panel === "emotes" || panel === "signs");
  return {
    studio: !joining && panel === "look",
    dropsVisible,
    // Die Säule der Schilder bräuchte den Platz. In den anderen Fällen läuft das Glas gar nicht.
    bubble: dropsVisible && panel !== "signs",
  };
}

/** Eigenschaften der Bühne samt ihrer Overlays. */
interface PetStageProps {
  game: PetGame;
  me: Me;
  panel: PanelId | null;
  /** Erst ein Konto oder ein Beitritt ist nötig: Am Jelly gibt es noch nichts zu bedienen. */
  joining: boolean;
  reducedMotion: boolean;
  onToggle: (panel: PanelId) => void;
  onClose: () => void;
}

/** Das anklickbare Jelly mit verzögert geladener Canvas. */
function PetVisual({
  game,
  me,
  reducedMotion,
  sign,
  voiced,
  focus,
  anchors,
}: {
  game: PetGame;
  me: Me;
  reducedMotion: boolean;
  sign: string | null;
  voiced: RefObject<ActiveVoice | null>;
  focus?: StudioFocus;
  anchors?: RefObject<HTMLElement | null>;
}) {
  return (
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
          emote={game.activeEmote}
          {...{ reducedMotion, sign, voiced, focus, anchors }}
        />
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
}: Omit<PetStageProps, "joining" | "reducedMotion"> & { onPreview: (key: string | null) => void }) {
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
      <MapDrop disabled={!game.ready} onOpen={() => void game.openMap()} />
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
      onEquip={(id) => void game.equip(id)}
      onColor={(color) => void game.customize({ color })}
      onName={(name) => game.customize({ name })}
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

/** Sprechblase, Jelly und das gerade zugängliche Overlay. */
export default function PetStage(props: PetStageProps) {
  const { game, me, panel, joining, reducedMotion, onToggle, onClose } = props;
  const stage = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<StudioRegionId | null>(null);
  const [preview, setPreview] = useSignPreview(panel === "signs");
  const { studio, dropsVisible, bubble } = stageModes(panel, joining);
  const { saidAt, voiced } = useJellyVoice(game);
  // Beim nächsten Öffnen soll keine Region mehr offen sein und die Kamera wieder zurückfahren.
  if (!studio && region) setRegion(null);
  return (
    <div className="pet-stage" ref={stage} data-duet={duetMode(game.activeEmote)}>
      <PetVisual
        {...{ game, me, reducedMotion, voiced }}
        sign={studio ? null : signLabel(preview ?? me.sign, game.catalog)}
        focus={REGIONS.find((item) => item.id === region)?.focus}
        anchors={studio || dropsVisible ? stage : undefined}
      />
      {studio ? <StudioOverlay {...{ game, me, region, onClose }} onRegion={setRegion} /> : null}
      {dropsVisible ? (
        <StageDrops {...{ game, me, panel, onToggle, onClose }} onPreview={setPreview} />
      ) : null}
      <StageBubble {...{ game, saidAt }} hidden={!bubble} />
      <div className="ground-shadow" />
      <h1 className="sr-only">
        {me.name}, Level {me.level}
      </h1>
    </div>
  );
}
