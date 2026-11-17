/**
 * Verbindet den Klang des Zauberladens mit seinem Fenster: Einstellungen, die erste Geste,
 * Sichtbarkeit, Fokus und Ruhe, das Klangthema für die Geräusche der Oberfläche und die Geräusche
 * unter dem Zeiger. Nur das Shop-Fenster bindet ihn ein; Pet und Karte behalten ihre MP3s.
 *
 * @module
 */

import { useEffect } from "react";

import type { Settings } from "../../pet/types";

import { SHOP_THEME } from "../../pet/shopScore";
import { setUiSoundTheme } from "../../uiSound";
import { OS_REDUCED_MOTION } from "../../useDocumentTheme";
import { listenForShopHovers } from "./listeners";
import { shopSound } from "./shopSound";

/** Gesten, die den Ton freigeben. Sie laufen in der Capture-Phase, vor jedem Klick. */
const GESTURES = ["pointerdown", "keydown"] as const;

/** Eingaben ohne Geste: Sie halten den Klang nur wach. */
const PRESENCE = ["pointermove", "wheel"] as const;

/** Höchstens so oft zählt eine Bewegung als Eingabe, in Millisekunden. */
const PRESENCE_EVERY_MS = 1000;

/** Folgt Schalter, Regler und reduzierter Bewegung aus den Einstellungen. */
function useSoundSettings({ sound, volume, reducedMotion }: Settings) {
  const calm = reducedMotion ?? OS_REDUCED_MOTION;
  useEffect(() => {
    shopSound.configure({ sound, volume, reducedMotion: calm });
  }, [sound, volume, calm]);
}

/** Die erste Geste gibt den Ton frei, jede weitere Eingabe hält ihn wach. */
function useArming() {
  useEffect(() => {
    let touchedAt = -Infinity;
    const arm = () => shopSound.arm();
    const touch = () => {
      const now = performance.now();
      if (now - touchedAt < PRESENCE_EVERY_MS) return;
      touchedAt = now;
      shopSound.touch();
    };
    const options = { capture: true, passive: true } as const;
    for (const gesture of GESTURES) window.addEventListener(gesture, arm, options);
    for (const input of PRESENCE) window.addEventListener(input, touch, options);
    return () => {
      for (const gesture of GESTURES) window.removeEventListener(gesture, arm, options);
      for (const input of PRESENCE) window.removeEventListener(input, touch, options);
    };
  }, []);
}

/** Versteckt hält der Klang an, ohne Fokus wird das Ambiente leiser. */
function useWindowState() {
  useEffect(() => {
    const visibility = () => shopSound.setHidden(document.hidden);
    const blur = () => shopSound.setFocused(false);
    const focus = () => shopSound.setFocused(true);
    shopSound.setFocused(document.hasFocus());
    visibility();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
    };
  }, []);
}

/**
 * Solange der Laden offen ist, klingen die Geräusche der Oberfläche nach Holz, Pergament, Messing
 * und Wachs. Was das Thema nicht kennt, bleibt beim MP3.
 */
function useUiTheme() {
  useEffect(() => {
    setUiSoundTheme((name) => {
      const cue = SHOP_THEME[name];
      if (!cue) return false;
      shopSound.cue(cue);
      return true;
    });
    return () => setUiSoundTheme(null);
  }, []);
}

/**
 * Der ganze Klang des Shop-Fensters. Einmal in `Shop.tsx` einbinden. Beim Abbau schließt er den
 * Kontext.
 */
export function useShopSound(settings: Settings) {
  useSoundSettings(settings);
  useArming();
  useWindowState();
  useUiTheme();
  useEffect(() => listenForShopHovers(shopSound), []);
  useEffect(() => () => shopSound.dispose(), []);
}
