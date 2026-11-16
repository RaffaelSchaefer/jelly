/**
 * Was der Zauberer im Shop sagt und welche Geste er dazu macht, als reine Rechnung. Abgespielt wird
 * es in `shop/useWizard.ts`.
 *
 * @module
 */

import type { ShopItem } from "./shop";

import { coinLabel } from "./cosmetics";
import { inMood, speechNotes, type VoiceNote } from "./voice";
import { EMOTE_CLIPS } from "./voiceClips";

/** Ein Anlass, zu dem der Zauberer etwas sagt. */
export type WizardMoment =
  | { kind: "greet"; name: string }
  | { kind: "select"; item: ShopItem; worn: boolean; open: boolean }
  | { kind: "bought" | "worn" | "off"; item: ShopItem }
  | { kind: "doze" | "wake" };

/** Die Gesten, die er dazu macht. */
export type WizardGesture = "wave" | "point" | "shrug" | "cheer" | "love";

/** Ein Satz des Zauberers. */
export interface WizardLine {
  text: string;
  /** Die Geste dazu. */
  gesture?: WizardGesture;
  /** Er nickt dabei ein und bleibt so, bis ihn etwas weckt. */
  doze?: true;
}

/** Seine Stimme liegt eine Quinte unter der des Jellys. */
const WIZARD_MOOD = { pitch: -7, tempo: 1 };

/** Eine von zwei Fassungen, damit er sich nicht wörtlich wiederholt. */
function pick(turn: number, texts: readonly [string, string]) {
  return texts[turn % 2];
}

/** Was er sagt, wenn ein Teil gewählt wird, das dem Jelly schon gehört. */
function ownedLine(worn: boolean, turn: number): WizardLine {
  if (worn)
    return { text: pick(turn, ["Steht dir prächtig.", "Das trägst du schon. Sehr elegant."]) };
  return {
    text: pick(turn, ["Das hast du schon. Willst du es anlegen?", "Schon deins! Leg es ruhig an."]),
    gesture: "point",
  };
}

/** Was er zu einem Teil sagt, das noch zu haben ist. */
function offerLine(item: ShopItem, turn: number): WizardLine {
  const name = item.cosmetic.name;
  if (item.state === "short") {
    const missing = coinLabel(item.missing);
    return {
      text: pick(turn, [
        `Dafür fehlen dir noch ${missing}.`,
        `Hm, noch ${missing}. Steig erst auf!`,
      ]),
      gesture: "shrug",
    };
  }
  const offer = pick(turn, [`${name}? Eine vorzügliche Wahl.`, `${name}, ein guter Handel!`]);
  return { text: item.perLan ? `${offer} Gilt aber nur für diese LAN.` : offer, gesture: "point" };
}

/** Sein Satz zu einer Auswahl. */
function selectLine(moment: Extract<WizardMoment, { kind: "select" }>, turn: number): WizardLine {
  if (moment.item.state === "owned") return ownedLine(moment.worn, turn);
  if (!moment.open) {
    return { text: "Ohne laufende LAN ruht mein Laden. Komm später wieder.", gesture: "shrug" };
  }
  return offerLine(moment.item, turn);
}

/**
 * Was der Zauberer zu `moment` sagt.
 *
 * @param turn - Zählt mit jedem Satz. Wechselt zwischen zwei Fassungen.
 */
export function wizardLine(moment: WizardMoment, turn: number): WizardLine {
  switch (moment.kind) {
    case "greet":
      return {
        text: pick(turn, [
          `Willkommen in meinem Laden, ${moment.name}!`,
          `Ah, ${moment.name}! Schau dich ruhig um.`,
        ]),
        gesture: "wave",
      };
    case "select":
      return selectLine(moment, turn);
    case "bought":
      return {
        text: pick(turn, [
          "Ein Handel! Möge es dir Glück bringen.",
          "Wunderbar, es gehört nun dir!",
        ]),
        gesture: "cheer",
      };
    case "worn":
      return { text: pick(turn, ["Steht dir prächtig!", "Ganz der Meister!"]), gesture: "love" };
    case "off":
      return { text: pick(turn, ["Wie du meinst.", "Auch ohne bist du schick."]) };
    case "doze":
      return { text: "Zzz …", doze: true };
    case "wake":
      return {
        text: pick(turn, ["Oh! Wo war ich … ach ja, der Laden.", "Hm? Ich hab nur kurz geruht."]),
      };
  }
}

/** Was er dabei singt: seine Worte eine Quinte tiefer, beim Einnicken ein Schnarchen. */
export function wizardNotes(line: WizardLine): VoiceNote[] {
  return inMood(line.doze ? EMOTE_CLIPS.sleep : speechNotes(line.text), WIZARD_MOOD);
}
