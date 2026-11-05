/**
 * Panel „Mitmachen“: Ein LAN- oder Sitzplatz-Code bringt das Konto in die LAN, ohne Konto legt er
 * mit Name und Farbe ein neues an. Ein verlorenes Konto holt nur der Wiederherstellungs-Code der
 * Orga zurück, der hat sein eigenes Formular.
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
        Dein alter Zugang gilt nicht mehr. Mit einem LAN- oder Sitzplatz-Code fängst du neu an, dein
        altes Konto holt nur ein Wiederherstellungs-Code der Orga zurück.
      </p>
    );
  }
  if (!game.lan.current) return <NoLan game={game} />;
  if (!game.me) return null;
  return <p className="panel-hint">Die Orga gibt dir einen Code für deinen Platz.</p>;
}

/** Das Formular für den Wiederherstellungs-Code, getrennt vom Code der LAN. */
function RecoverForm({
  disabled,
  onRecover,
  onBack,
}: {
  disabled: boolean;
  onRecover: (code: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    onRecover(code);
  }
  return (
    <form onSubmit={submit}>
      <p className="panel-hint">
        Die Orga sucht dein Konto und gibt dir einen Wiederherstellungs-Code. Er gilt einmal, danach
        gilt nur noch dieses Gerät.
      </p>
      <TextField
        id="recover-code"
        label="Wiederherstellungs-Code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        required
        autoComplete="off"
      />
      <PrimaryButton disabled={disabled || !code.trim()} type="submit">
        Konto zurückholen
      </PrimaryButton>
      <button type="button" className="text-button" onClick={onBack}>
        Zurück
      </button>
    </form>
  );
}

/** Das Formular für den LAN- oder Sitzplatz-Code. Ohne Konto fragt es auch nach Name und Farbe. */
function JoinForm({
  game,
  disabled,
  onRedeem,
  onRecover,
}: {
  game: Game;
  disabled: boolean;
  onRedeem: (code: string, name?: string, color?: PetColor) => void;
  onRecover: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState<PetColor>("mint");
  // Ohne Konto oder mit abgelehntem Secret legt der Code ein neues an, dafür zählt der Name.
  const account = game.me === null || game.secretRejected;
  const trimmed = name.trim();
  function submit(event: FormEvent) {
    event.preventDefault();
    if (account) onRedeem(code, trimmed, color);
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
        label={lanName ? `Code für ${lanName}` : "Dein Code"}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        required
        autoComplete="off"
      />
      <PrimaryButton disabled={disabled || !code.trim() || (account && !trimmed)} type="submit">
        {account ? "Los geht’s" : "Einlösen"}
      </PrimaryButton>
      {account ? (
        <button type="button" className="text-button" onClick={onRecover}>
          Konto verloren? Wiederherstellungs-Code eingeben
        </button>
      ) : null}
    </form>
  );
}

/** Das Panel: der Code der LAN, oder auf Wunsch der Wiederherstellungs-Code. */
export default function JoinPanel({
  game,
  disabled,
  onRedeem,
  onRecover,
}: {
  game: Game;
  disabled: boolean;
  onRedeem: (code: string, name?: string, color?: PetColor) => void;
  onRecover: (code: string) => void;
}) {
  const [recovering, setRecovering] = useState(false);
  if (recovering) {
    return (
      <RecoverForm disabled={disabled} onRecover={onRecover} onBack={() => setRecovering(false)} />
    );
  }
  return (
    <JoinForm
      game={game}
      disabled={disabled}
      onRedeem={onRedeem}
      onRecover={() => setRecovering(true)}
    />
  );
}
