/**
 * Der Einstieg als Schlüpfen: Welche Schritte ein Stand braucht und was das Jelly dazu sagt. Die
 * Bühne dazu steht in `Hatch.tsx`.
 *
 * @module
 */

import type { Game, PetColor } from "./types";

/** Ein Schritt des Einstiegs. `recover` liegt neben dem Weg und ist nur von `name` aus erreichbar. */
export type HatchStep = "name" | "color" | "code" | "recover";

/** Was das Jelly zur frischen Farbe sagt. */
const COLOR_LINES: Record<PetColor, string> = {
  mint: "Aqua! Frisch wie ein Schluck Wasser.",
  lilac: "Flieder! Das ist so was von meins.",
  peach: "Pfirsich! Süß und ein bisschen frech.",
};

/** Datum als „25.11., 12:00“. */
const lanDate = (at: number) =>
  new Date(at).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Ob noch ein Code nötig ist, bevor das Jelly mitspielt. Nach einem gültigen Code kann das so
 * bleiben: Ein Wiederherstellungs-Code holt nur das Konto zurück, und der Code einer kommenden LAN
 * bringt es nicht in die laufende.
 */
export function needsCode({ me, lan }: Pick<Game, "me" | "lan">) {
  return me === null || (lan.current !== null && lan.joined === false);
}

/** Ob der Code ein neues Konto anlegt. Dann schlüpft das Jelly erst und braucht Name und Farbe. */
export function hatchesNew({ me, secretRejected }: Pick<Game, "me" | "secretRejected">) {
  return me === null || secretRejected;
}

/**
 * Der Schritt, der gerade gilt. Der Stand kann sich unterwegs ändern, ein abgelehntes Secret macht
 * aus einem bekannten Jelly etwa ein neues. Dann gilt der erste Schritt des neuen Wegs.
 *
 * @param wanted - Wo der Nutzer zuletzt hingegangen ist.
 */
export function hatchStep(wanted: HatchStep, game: Pick<Game, "me" | "secretRejected">): HatchStep {
  if (hatchesNew(game)) return wanted;
  return "code";
}

/** Der Schritt davor, oder `null`, wenn es zurück nichts mehr gibt. */
export function hatchBack(step: HatchStep, game: Pick<Game, "me" | "secretRejected">) {
  if (!hatchesNew(game)) return null;
  const before: Record<HatchStep, HatchStep | null> = {
    name: null,
    color: "name",
    code: "color",
    recover: "name",
  };
  return before[step];
}

/** Was {@link hatchLine} wissen muss. */
export interface HatchMoment {
  step: HatchStep;
  game: Pick<Game, "me" | "lan" | "secretRejected">;
  /** Der Name im Entwurf, ohne Leerzeichen am Rand. */
  name: string;
  /** Die gewählte Farbe, solange noch nicht gewählt `null`. */
  picked: PetColor | null;
  /** Die letzte Fehlermeldung, sonst leer. */
  error: string;
  /** Ein Code hat gegolten, und die laufende LAN verlangt trotzdem noch einen. */
  accepted: boolean;
}

/** Was das Jelly sagt, solange gerade keine LAN läuft. Ein Code gilt trotzdem. */
function noLanLine({ next }: HatchMoment["game"]["lan"]) {
  const when = next
    ? `Die nächste: ${next.name} ab ${lanDate(next.starts_at)}.`
    : "Schau später wieder vorbei.";
  return `Gerade läuft keine LAN. ${when}`;
}

/** Was das Jelly im Schritt `code` sagt. */
function codeLine({ me, lan, secretRejected }: HatchMoment["game"], accepted: boolean) {
  if (me && !secretRejected) {
    if (accepted) return `Der Code gilt! Für ${lan.current?.name} brauchst du noch einen eigenen.`;
    return `Schön, dich zu sehen, ${me.name}! Die Orga gibt dir einen Code für deinen Platz.`;
  }
  if (!lan.current) return noLanLine(lan);
  return `Fast da! Die Orga hat den Code für ${lan.current.name}.`;
}

/** Was das Jelly gerade sagt. Eine Fehlermeldung geht immer vor: Sie steht nirgends sonst. */
export function hatchLine({ step, game, name, picked, error, accepted }: HatchMoment) {
  if (error) return error;
  switch (step) {
    case "name":
      return game.secretRejected
        ? "Dein alter Zugang gilt nicht mehr. Neu anfangen oder Konto zurückholen?"
        : "Hey, ich bin neu hier. Wie heiße ich?";
    case "color":
      return picked ? COLOR_LINES[picked] : `${name}! Das gefällt mir. Welche Farbe steht mir?`;
    case "code":
      return codeLine(game, accepted);
    case "recover":
      return "Die Orga sucht mich und gibt dir einen Code. Er gilt einmal, danach nur dieses Gerät.";
  }
}
