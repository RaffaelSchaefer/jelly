/**
 * Reiter „Dazustellen“ im Panel „Dabei“: die anderen Jellies der Bühne. Neben dem gewählten steht
 * das eigene Jelly dann auf der Bühne.
 *
 * @module
 */

import { useEffect } from "react";

import { filterStagePlayers, signIcon, stagePlayerHex, type Me, type StagePlayer } from "../pet";
import { Icon, PrimaryButton } from "../ui";
import PlayerSearch, { usePlayerSearch } from "./PlayerSearch";

/** Was anstelle der Liste steht, sonst `null`. */
function emptyNote(allowed: boolean, players: StagePlayer[] | null, shown: number) {
  if (!allowed) return "Nur während einer LAN";
  if (!players) return "Noch keine Liste von der Bühne.";
  if (players.length === 0) return "Niemand sonst auf der Bühne.";
  return shown === 0 ? "Kein Jelly heißt so." : null;
}

/**
 * Ein Jelly der Liste. Ein Klick auf das gewählte geht wieder weg.
 *
 * Gesperrt wird wie bei den Schildern mit `aria-disabled`, damit der Knopf während des Aufrufs den
 * Fokus behält.
 */
function FollowRow({
  player,
  selected,
  disabled,
  onPick,
}: {
  player: StagePlayer;
  selected: boolean;
  disabled: boolean;
  onPick: (playerId: number | null) => void;
}) {
  return (
    <button
      type="button"
      className="action-button"
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={() => onPick(selected ? null : player.id)}
    >
      <span
        className="follow-dot"
        style={{ background: stagePlayerHex(player.color) }}
        aria-hidden="true"
      />
      <strong>{player.name}</strong>
      <span className="action-xp follow-marks">
        {player.sign ? <Icon name={signIcon(player.sign)} /> : null}
        {player.sign ? <span className="sr-only">hält ein Schild hoch</span> : null}
        {selected ? <Icon name="check" /> : null}
      </span>
    </button>
  );
}

/**
 * Liest beim Öffnen die Liste und zeigt sie, darüber Suche und, solange ein Ziel gesetzt ist,
 * „Weggehen“.
 */
export default function FollowTab({
  me,
  players,
  allowed,
  disabled,
  onLoad,
  onPick,
}: {
  me: Me;
  /** `null`, solange die Bühne noch keine Liste geliefert hat. */
  players: StagePlayer[] | null;
  /** Läuft eine LAN, an der das Jelly teilnimmt? Sonst gibt es nichts zu wählen. */
  allowed: boolean;
  disabled: boolean;
  onLoad: () => Promise<void>;
  onPick: (playerId: number | null) => Promise<boolean>;
}) {
  useEffect(() => void onLoad(), [onLoad]);
  const search = usePlayerSearch();
  const shown = filterStagePlayers(players ?? [], search.query);
  const note = emptyNote(allowed, players, shown.length);
  const target = me.follow_player_id;
  function pick(playerId: number | null) {
    if (!disabled) void onPick(playerId);
  }
  return (
    <>
      {allowed && players?.length ? <PlayerSearch search={search} /> : null}
      {/* Eigener Knopf: Ist das Ziel gerade abwesend, steht es nicht in der Liste. */}
      {allowed && target !== null ? (
        <PrimaryButton className="follow-leave" disabled={disabled} onClick={() => pick(null)}>
          Weggehen
        </PrimaryButton>
      ) : null}
      {note ? (
        <p className="panel-note">{note}</p>
      ) : (
        <div className="action-list follow-list">
          {shown.map((player) => (
            <FollowRow
              key={player.id}
              player={player}
              selected={player.id === target}
              disabled={disabled}
              onPick={pick}
            />
          ))}
        </div>
      )}
    </>
  );
}
