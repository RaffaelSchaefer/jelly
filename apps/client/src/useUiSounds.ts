/**
 * Verbindet die Geräusche der Oberfläche (`uiSound.ts`) mit der App: Einstellungen, Klicks, Fehler
 * und die schönen Momente im Spiel.
 *
 * @module
 */

import { useEffect, useRef } from "react";

import type { PetGame } from "./usePet";

import { gameSoundFor, type GameMoment, type Settings } from "./pet";
import { listenForUiSounds, uiSounds } from "./uiSound";

/** Spielt zu jeder hörbaren Änderung im Spielstand ihr Geräusch: XP, Erfolge, Einladung, Schlüpfen. */
function useGameSounds(game: PetGame) {
  const me = game.game.me;
  const xp = me ? me.total_xp : null;
  const honors = me ? me.achievements.length + me.awards.length : null;
  const invited = game.incoming !== null;
  const { hatching } = game;
  const before = useRef<GameMoment>({ xp, honors, invited, hatching });

  useEffect(() => {
    const after: GameMoment = { xp, honors, invited, hatching };
    const sound = gameSoundFor(before.current, after);
    before.current = after;
    if (sound) uiSounds.play(sound);
  }, [xp, honors, invited, hatching]);
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

/** Alle Geräusche des Pet-Fensters: Klicks, Fehler und die schönen Momente im Spiel. */
export function useUiSounds(game: PetGame) {
  useClickSounds(game.game.settings, game.error);
  useGameSounds(game);
}
