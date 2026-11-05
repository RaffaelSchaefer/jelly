/**
 * Panel „Mitmachen“: Ein Code bringt ein neues Konto, holt das vorhandene zurück oder setzt es auf
 * einen Platz der laufenden LAN. Alles läuft über denselben Weg, den Unterschied kennt der Server.
 *
 * @module
 */

import { useState, type FormEvent } from "react";

import type { Game, PetColor } from "../pet";

import { ColorChoice, PrimaryButton, TextField } from "../ui";

/** Datum als „25.11., 12:00“. */
const date = (at: number) =>
  new Date(at).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Hinweis, wenn gerade keine LAN läuft. Ein Code gilt trotzdem. */
function NoLan({ game }: { game: Game }) {
  const { next } = game.lan;
  return (
    <p className="panel-hint">
      Gerade läuft keine LAN.{" "}
      {next
        ? `Die nächste: ${next.name} ab ${date(next.starts_at)}.`
        : "Schau später wieder vorbei."}
    </p>
  );
}

/** Was über dem Formular steht. */
function JoinHint({ game }: { game: Game }) {
  if (game.secretRejected) {
    return (
      <p className="panel-hint">
        Dein alter Zugang gilt nicht mehr. Hol dir von der Orga einen Code.
      </p>
    );
  }
  if (!game.lan.current) return <NoLan game={game} />;
  if (!game.me) return null;
  return <p className="panel-hint">Die Orga gibt dir einen Code für deinen Platz.</p>;
}

/**
 * Das Formular. Ohne Konto fragt es auch nach Name und Farbe. War der Zugang abgelaufen, kommt das
 * Konto meist mit dem Code zurück, der Name zählt dann nur, wenn der Server ein neues anlegt.
 */
export default function JoinPanel({
  game,
  disabled,
  onRedeem,
}: {
  game: Game;
  disabled: boolean;
  onRedeem: (code: string, name?: string, color?: PetColor) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState<PetColor>("mint");
  const account = game.me === null;
  const trimmed = name.trim();
  const needsName = account && !game.secretRejected;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (account && trimmed) onRedeem(code, trimmed, color);
    else onRedeem(code);
  }
  const lanName = game.lan.current?.name;
  return (
    <form onSubmit={submit}>
      <JoinHint game={game} />
      {account ? (
        <>
          <TextField
            id="join-name"
            label={needsName ? "Wie heißt dein Begleiter?" : "Name, falls du neu anfängst"}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            required={needsName}
            autoComplete="off"
          />
          <ColorChoice value={color} onChange={setColor} />
        </>
      ) : null}
      <TextField
        id="join-code"
        label={lanName ? `Code für ${lanName}` : "Dein Code"}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        required
        autoComplete="off"
      />
      <PrimaryButton disabled={disabled || !code.trim() || (needsName && !trimmed)} type="submit">
        {needsName ? "Los geht’s" : "Einlösen"}
      </PrimaryButton>
    </form>
  );
}
