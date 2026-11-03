/**
 * Panel „Mitmachen“: Konto anlegen oder mit einem vorhandenen Konto der laufenden LAN beitreten.
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

/** Hinweis, wenn gerade keine LAN läuft. */
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

/** Formular für Konto und Beitritt. Ohne Konto fragt es auch nach Name und Farbe. */
export default function JoinPanel({
  game,
  disabled,
  onRegister,
  onJoin,
}: {
  game: Game;
  disabled: boolean;
  onRegister: (code: string, name: string, color: PetColor) => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState<PetColor>("mint");
  const account = game.me === null;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (account) onRegister(code, name, color);
    else onJoin(code);
  }
  if (!game.lan.current) return <NoLan game={game} />;
  return (
    <form onSubmit={submit}>
      {game.tokenRejected ? (
        <p className="panel-hint">Dein alter Zugang gilt nicht mehr. Leg einfach einen neuen an.</p>
      ) : null}
      {account ? (
        <>
          <TextField
            id="join-name"
            label="Wie heißt dein Begleiter?"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            required
            autoComplete="off"
          />
          <ColorChoice value={color} onChange={setColor} />
        </>
      ) : null}
      <TextField
        id="join-code"
        label={`Code für ${game.lan.current.name}`}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        required
        autoComplete="off"
      />
      <PrimaryButton disabled={disabled || !code.trim() || (account && !name.trim())} type="submit">
        {account ? "Los geht’s" : "Beitreten"}
      </PrimaryButton>
      <p className="panel-note">Server: {game.serverUrl}</p>
    </form>
  );
}
