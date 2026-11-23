/**
 * Lässt den Zauberer leben. Sein Gehirn (`pet/wizardBrain.ts`) entscheidet, was er wann tut, der
 * Spieler (`useWizardPlayer.ts`) führt es aus, seine Sinne (`useWizardSenses.ts`) melden, was im
 * Fenster geschieht. Ein einziger Zeitgeber wartet auf den nächsten Termin des Gehirns.
 *
 * Die Oberfläche meldet sich mit Hinweisen (`notice`). Er spricht mit seiner alten Stimme über den
 * Klang des Ladens (`shopSound.voiceRoute`), der das Ambiente unter seinen Sätzen duckt. Seine
 * Geräusche spielt `shopSound`, seine Effekte `shopFx` und die Rolle (`wizardEffects.ts`). Er grüßt
 * 350 ms nachdem die Szene steht, spätestens 2,5 s nachdem die Daten da sind, und auch im
 * StrictMode nur einmal. In der Vorschau döst er mit `#shop-doesen` schon nach 4 s und schläft nach
 * 8 s, mit `#shop-nerven` kommt sein geklauter Hut schneller zurück.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import type { Settings } from "../pet/types";
import type { ActiveEmote } from "../useEmotes";
import type { ActiveVoice } from "../useJellyVoice";

import { desktop } from "../backend";
import { TEASE } from "../pet/shopTimeline";
import { WIZARD_TIMBRE } from "../pet/voiceTimbre";
import { createWizardMind, wizardStep, type WizardMind } from "../pet/wizardBrain";
import { type MindTiming } from "../pet/wizardMind";
import { type WizardEvent, type WizardNotice, type WizardPose } from "../pet/wizardScripts";
import { OS_REDUCED_MOTION } from "../useDocumentTheme";
import { createVoice } from "../voice";
import { shopSound } from "./sound/shopSound";
import {
  useWizardPlayer,
  type CustomerCue,
  type SaidLine,
  type WizardEffectCue,
  type WizardPlayer,
} from "./useWizardPlayer";
import { useWizardSenses, type WizardWorld } from "./useWizardSenses";
import { showWizardEffect } from "./wizardEffects";
import { wizardVoiceLayers } from "./wizardVoiceLayers";

export type { CustomerCue, SaidLine, WizardEffectCue } from "./useWizardPlayer";
export type { WizardWorld } from "./useWizardSenses";

/**
 * Seine alte, dunkle Stimme mit Brust, Knarren und Luft. Sie singt in den Klang des Ladens, links
 * bei ihm, und hat kein eigenes Audiogerät.
 */
const voice = createVoice({
  timbre: WIZARD_TIMBRE,
  layers: wizardVoiceLayers,
  route: () => shopSound.voiceRoute("wizard"),
});

/** Was als Geste des Nutzers zählt: Sie macht den Ton frei. */
const GESTURES = ["pointerdown", "keydown"] as const;

/** Wann er grüßt: nach der Szene, spätestens nach den Daten. */
const GREET = { afterSceneMs: 350, fallbackMs: 2500 } as const;

/** Der Zeitgeber wartet mindestens so lange und höchstens so lange, wie der Browser kann. */
const TICK = { minMs: 10, maxMs: 2 ** 31 - 1 } as const;

/**
 * Kürzere Zeiten in der Vorschau: Mit `#shop-doesen` ist er nach 4 s schläfrig und nach 8 s
 * eingeschlafen, mit `#shop-nerven` zaubert er sich den geklauten Hut schon nach 9 s zurück.
 */
const PREVIEW_TIMING: Readonly<Record<string, MindTiming>> = {
  "#shop-doesen": { drowsyMs: 4000, asleepMs: 4000 },
  "#shop-nerven": { hatBackMs: TEASE.previewBack },
};

/** Die Zeiten dieses Fensters. */
const MIND_TIMING: MindTiming = (!desktop && PREVIEW_TIMING[location.hash]) || {};

/** Alles, was der Zauberer dem Laden bietet. */
export interface WizardControls {
  /** Was er zuletzt sagte, `null` vor dem ersten Satz. */
  said: SaidLine | null;
  /** Die laufende Geste als geteiltes Emote. */
  emote: ActiveEmote | null;
  /** Ob er schläft. */
  dozing: boolean;
  /** Was er gerade singt. Sein Mund folgt den Vokalen. */
  voiced: RefObject<ActiveVoice | null>;
  /** Ein Hinweis der Oberfläche. Stabil. */
  notice: (notice: WizardNotice) => void;
  /** Seine Haltung, Bild für Bild gelesen. */
  pose: RefObject<WizardPose>;
  /** Steigt, wenn sich die Haltung ändert. */
  poseVersion: number;
  /** Steigt mit jedem losbrechenden Zauber: Der Kern der Kristallkugel flammt auf. */
  pulse: number;
  /** Die letzten Effekte, der jüngste zuletzt. */
  effects: readonly WizardEffectCue[];
  /** Was die Kundschaft tut. */
  customer: CustomerCue;
  /** Die Szene steht. Stabil. */
  onSceneReady: () => void;
}

/** Folgt dem Ton-Schalter, die Lautstärke regelt der Klang des Ladens. Die erste Geste macht frei. */
function useVoiceSettings({ sound }: Settings) {
  const soundOn = useRef(sound);
  useEffect(() => {
    soundOn.current = sound;
    if (!sound) voice.stop();
  }, [sound]);
  useEffect(() => {
    const arm = () => voice.arm();
    for (const gesture of GESTURES) window.addEventListener(gesture, arm, true);
    return () => {
      for (const gesture of GESTURES) window.removeEventListener(gesture, arm, true);
    };
  }, []);
  return soundOn;
}

/**
 * Das Gehirn mit seinem einen Zeitgeber. `dispatch` ist stabil und nimmt jedes Ereignis, auch den
 * fälligen Termin.
 */
function useMind({ play, look }: Pick<WizardPlayer, "play" | "look">) {
  const mind = useRef<WizardMind | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const nextAt = useRef(Infinity);
  const dispatch = useCallback(
    function step(event: WizardEvent) {
      const now = performance.now();
      mind.current ??= createWizardMind(Date.now(), now, MIND_TIMING);
      const result = wizardStep(mind.current, event, now);
      mind.current = result.mind;
      if (result.look) look(result.look);
      if (result.script) play(result.script, result.interrupt, now);
      nextAt.current = result.nextTickAt;
      window.clearTimeout(timer.current);
      if (!Number.isFinite(result.nextTickAt)) return;
      const wait = Math.min(TICK.maxMs, Math.max(TICK.minMs, result.nextTickAt - now));
      timer.current = window.setTimeout(() => step({ kind: "tick" }), wait);
    },
    [play, look],
  );
  useEffect(() => {
    // Nach dem Probe-Abbau im StrictMode wartet der Termin von vorher wieder.
    if (Number.isFinite(nextAt.current)) dispatch({ kind: "tick" });
    return () => window.clearTimeout(timer.current);
  }, [dispatch]);
  return { dispatch };
}

/** Grüßt, wenn Daten und Szene da sind. Das Gehirn grüßt nur einmal, auch wenn es zweimal hört. */
function useGreeting(dispatch: (event: WizardEvent) => void, dataReady: boolean) {
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    if (!dataReady) return;
    const wait = sceneReady ? GREET.afterSceneMs : GREET.fallbackMs;
    const timer = window.setTimeout(() => dispatch({ kind: "ready" }), wait);
    return () => window.clearTimeout(timer);
  }, [dispatch, dataReady, sceneReady]);
  return useCallback(() => setSceneReady(true), []);
}

/** Döst er, wird das Ambiente leiser und das Knistern seltener. */
function useDozingSound(dozing: boolean) {
  useEffect(() => shopSound.setMood(dozing ? "dozing" : "awake"), [dozing]);
}

/**
 * Der Zauberer: was er sagt und tut, wie er dasteht und was die Kundschaft dazu macht.
 *
 * @param world - Was der Laden über Kundschaft und Waren weiß.
 */
export function useWizard(settings: Settings, world: WizardWorld): WizardControls {
  const soundOn = useVoiceSettings(settings);
  const player = useWizardPlayer({
    voice,
    soundOn: () => soundOn.current,
    onSfx: (sound) => void shopSound.sfx(sound),
    onEffect: showWizardEffect,
  });
  const { dispatch } = useMind(player);
  const onSceneReady = useGreeting(dispatch, Boolean(world.me));
  useWizardSenses(dispatch, settings.reducedMotion ?? OS_REDUCED_MOTION, world);
  const notice = useCallback((next: WizardNotice) => dispatch(next), [dispatch]);
  const { said, emote, dozing, voiced, pose, poseVersion, pulse, effects, customer } = player;
  useDozingSound(dozing);
  return {
    said,
    emote,
    dozing,
    voiced,
    notice,
    pose,
    poseVersion,
    pulse,
    effects,
    customer,
    onSceneReady,
  };
}
