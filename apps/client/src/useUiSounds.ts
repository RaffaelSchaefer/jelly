/**
 * Verbindet die Geräusche der Oberfläche (`uiSound.ts`) mit der App: Einstellungen, Klicks, Fehler
 * und die schönen Momente im Spiel.
 *
 * @module
 */

import { useEffect, useRef } from "react";

import type { PetGame } from "./usePet";

import { gameSoundFor, type GameMoment } from "./pet";
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
 * Hört auf Klicks, Schalter und Schreiben, solange die App läuft, folgt Schalter und Regler der
 * Geräusche und lässt jeden neuen Fehler einmal klingen.
 */
export function useUiSounds(game: PetGame) {
  const { sound, volume } = game.game.settings;
  useEffect(listenForUiSounds, []);

  useEffect(() => {
    uiSounds.configure(sound, volume);
  }, [sound, volume]);

  useEffect(() => {
    if (game.error) uiSounds.play("error");
  }, [game.error]);

  useGameSounds(game);
}
