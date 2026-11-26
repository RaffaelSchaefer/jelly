/**
 * Verbindet die Geräusche der Oberfläche (`uiSound.ts`) mit der App: Einstellungen, Klicks, Fehler
 * und die schönen Momente im Spiel, dazu die leise Musik unter den Jelly-News und zur Polonaise.
 *
 * @module
 */

import { useEffect, useRef } from "react";

import type { PetGame } from "./usePet";

import { playCongaBed, retryCongaBed, stopCongaBed } from "./congaBedSound";
import { playNewsBed, stopNewsBed } from "./newsBedSound";
import { gameSoundFor, type GameMoment, type Settings } from "./pet";
import { listenForUiSounds, uiSounds } from "./uiSound";

/**
 * Spielt zu jeder hörbaren Änderung im Spielstand ihr Geräusch: XP, Erfolge, Einladung, Schlüpfen
 * und den Jingle, wenn die Jelly-News beginnen.
 */
function useGameSounds(game: PetGame) {
  const me = game.game.me;
  const xp = me ? me.total_xp : null;
  const honors = me ? me.achievements.length + me.awards.length : null;
  const invited = game.incoming !== null;
  const { hatching } = game;
  const news = game.newsJingle?.show ?? null;
  const before = useRef<GameMoment>({ xp, honors, invited, hatching, news });

  useEffect(() => {
    const after: GameMoment = { xp, honors, invited, hatching, news };
    const sound = gameSoundFor(before.current, after);
    before.current = after;
    if (sound) uiSounds.play(sound);
  }, [xp, honors, invited, hatching, news]);
}

/**
 * Hört auf Klicks, Schalter und Schreiben, solange das Fenster lebt, folgt Schalter und Regler der
 * Geräusche und lässt jeden neuen Fehler einmal klingen. Auch für den Shop.
 */
export function useClickSounds(settings: Settings, error: string) {
  const { sound, volume } = settings;
  useEffect(listenForUiSounds, []);

  useEffect(() => {
    uiSounds.configure(sound, volume);
  }, [sound, volume]);

  useEffect(() => {
    if (error) uiSounds.play("error");
  }, [error]);
}

/**
 * Die leise Musik unter den Jelly-News: Sie beginnt mit jeder Sendung und endet mit ihr von selbst.
 * Endet die Sendung vorzeitig oder kommt eine neue, blendet die alte aus. Einmal mit dem Schalter
 * verstummt, kommt sie erst mit der nächsten Sendung wieder.
 */
function useNewsBed(bed: PetGame["newsBed"]) {
  useEffect(() => {
    if (!bed) return;
    playNewsBed(bed.seconds);
    return stopNewsBed;
  }, [bed]);
}

/** Was als Geste zählt, die gesperrten Ton freigibt, wie für die Stimme in `useJellyVoice.ts`. */
const GESTURES = ["pointerdown", "keydown"] as const;

/**
 * Die ganz leise Musik zur Polonaise, solange `wanted` gilt. Sie blendet weich ein und aus. Durfte
 * sie noch nicht klingen, weil die WebView Ton bis zur ersten Geste sperrt, beginnt sie mit dieser
 * Geste.
 */
function useCongaBed(wanted: boolean) {
  useEffect(() => {
    if (!wanted) return;
    playCongaBed();
    for (const gesture of GESTURES) window.addEventListener(gesture, retryCongaBed);
    return () => {
      for (const gesture of GESTURES) window.removeEventListener(gesture, retryCongaBed);
      stopCongaBed();
    };
  }, [wanted]);
}

/**
 * Alle Geräusche des Pet-Fensters: Klicks, Fehler, die schönen Momente im Spiel und die Musik.
 *
 * Es läuft nie zweierlei Musik zugleich, die Jelly-News gehen vor: Vom Jingle bis zum Ende der
 * Sendung schweigt die Musik der Polonaise und setzt danach wieder ein, wenn sie noch tanzt. Sie
 * folgt dem Schalter der Geräusche, auch wieder zurück.
 */
export function useUiSounds(game: PetGame) {
  const { settings } = game.game;
  // Vor der Musik: Sie beginnt nur, wenn die Geräusche schon eingeschaltet sind.
  useClickSounds(settings, game.error);
  useGameSounds(game);
  useNewsBed(game.newsBed);
  useCongaBed(game.conga !== null && !game.newsOnAir && settings.sound);
}
