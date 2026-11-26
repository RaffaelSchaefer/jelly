/**
 * Wann das Pet-Fenster ohne Zeiger oder Finger Knöpfe ausblendet (`Settings.idleView`), reine
 * Rechnung: wer gerade beim Fenster ist, wie lange ein Finger nachwirkt und wann ein Tipp nur
 * einblendet. Was dann wirklich verschwindet, steht in `src/idle.css`.
 *
 * @module
 */

import type { IdleView } from "./types";

/** Was gerade offen ist und deshalb sichtbar bleiben muss. Jedes `true` hält alles sichtbar. */
export interface IdleNeeds {
  /** Ein Panel, Studio, Aufstieg oder die Wahl von Emote oder Schild. */
  panel: boolean;
  /** Der Einstieg mit Code. */
  joining: boolean;
  /** Das Schlüpfen nach dem Einstieg. */
  hatching: boolean;
  /** Eine Aufforderung zum Partner-Emote. */
  invite: boolean;
  /** Die Update-Karte über dem Dock. */
  update: boolean;
  /** Eine Fehlermeldung. */
  error: boolean;
}

/**
 * Was jetzt ausgeblendet ist. Steht der Zeiger über dem Fenster oder ist etwas offen, das der
 * Mensch braucht, bleibt alles sichtbar.
 *
 * @param setting - Die Einstellung.
 * @param pointerInside - Ob jemand beim Fenster ist ({@link isPresent}).
 * @returns `"all"`, wenn nichts ausgeblendet ist, sonst die Stufe der Einstellung.
 */
export function idleViewNow(setting: IdleView, pointerInside: boolean, needs: IdleNeeds): IdleView {
  if (setting === "all" || pointerInside) return "all";
  return Object.values(needs).some(Boolean) ? "all" : setting;
}

/**
 * So lange bleibt nach dem letzten Finger alles eingeblendet, in Millisekunden. Ein Finger schwebt
 * nicht, sein Verlassen sagt nichts. Danach beginnt das Ausblenden aus `idle.css`.
 */
export const TOUCH_SHOW_MS = 5000;

/** Wer gerade beim Fenster ist. */
export interface Presence {
  /** Maus oder Stift schweben über dem Fenster. */
  hovering: boolean;
  /** Ein Finger liegt auf dem Fenster. */
  touching: boolean;
  /** Bis wann der letzte Finger nachwirkt, in der Zeit von `performance.now()`. */
  touchUntil: number;
}

/** Niemand ist da. */
export const NOBODY: Presence = { hovering: false, touching: false, touchUntil: -Infinity };

/**
 * Was am Fenster geschieht. `point` und `leave` kommen von Maus und Stift, `touch` und `lift` vom
 * Finger, `blur`, wenn das Fenster den Fokus verliert.
 */
export type PresenceEvent =
  | { kind: "point"; inside: boolean }
  | { kind: "leave" }
  | { kind: "touch"; inside: boolean }
  | { kind: "lift"; at: number }
  | { kind: "blur"; at: number };

/** Ein Finger hebt sich: Ab jetzt wirkt er noch {@link TOUCH_SHOW_MS} nach. */
function lifted(presence: Presence, at: number): Presence {
  if (!presence.touching) return presence;
  return {
    ...presence,
    touching: false,
    touchUntil: Math.max(presence.touchUntil, at + TOUCH_SHOW_MS),
  };
}

/**
 * Der Stand nach einem Ereignis. Ein Finger außerhalb des Fensters (in der Browser-Vorschau) ändert
 * nichts. Verliert das Fenster den Fokus, ist der Zeiger draußen, ein Finger wirkt aber nach.
 */
export function nextPresence(presence: Presence, event: PresenceEvent): Presence {
  switch (event.kind) {
    case "point":
      return { ...presence, hovering: event.inside };
    case "leave":
      return { ...presence, hovering: false };
    case "touch":
      return event.inside ? { ...presence, touching: true } : presence;
    case "lift":
      return lifted(presence, event.at);
    case "blur":
      return { ...lifted(presence, event.at), hovering: false };
  }
}

/** Ob jemand beim Fenster ist: Zeiger darüber, Finger darauf oder eben erst gehoben. */
export function isPresent(presence: Presence, now: number): boolean {
  return presence.hovering || presence.touching || now < presence.touchUntil;
}

/** Wann {@link isPresent} von selbst falsch wird, oder `null`, wenn das nicht von der Zeit abhängt. */
export function presenceEndsAt(presence: Presence, now: number): number | null {
  if (presence.hovering || presence.touching || now >= presence.touchUntil) return null;
  return presence.touchUntil;
}

/**
 * Ob ein Druck nur einblendet, statt etwas zu drücken: Finger und Stift auf einem ausgeblendeten
 * Knopf. Das Jelly selbst darf man auch dann stupsen. Die Maus schwebt vorher darüber, bei ihr ist
 * nie etwas ausgeblendet, wenn sie drückt.
 */
export function onlyReveals(pointerType: string, hidden: boolean, onJelly: boolean): boolean {
  return hidden && !onJelly && pointerType !== "mouse";
}
