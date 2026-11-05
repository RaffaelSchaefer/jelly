/**
 * Eingabe eines Partner-Codes in einzelne Ziffernfelder, ohne React.
 *
 * @module
 */

/** Länge eines Partner-Codes laut Server-Vertrag. */
export const PARTNER_CODE_LENGTH = 4;

/** Ab diesem Anteil der Restzeit drängt die Uhr. */
const PARTNER_CLOCK_URGENT = 0.25;

/** Wie voll die Uhr noch ist, von 0 bis 1, und ob man sich beeilen muss. */
export function partnerClock(remainingMs: number, durationMs: number) {
  const left = Math.min(1, Math.max(0, remainingMs / durationMs));
  return { left, urgent: left <= PARTNER_CLOCK_URGENT };
}

/** Neue Ziffern und das Feld, das danach den Fokus bekommt. */
export interface CodeEntry {
  digits: string[];
  focus: number;
}

/** Die leeren Felder. */
export const emptyPartnerCode = () => Array<string>(PARTNER_CODE_LENGTH).fill("");

/**
 * Was in einem Feld neu getippt wurde. Steht der Cursor neben der alten Ziffer, enthält das Feld
 * beide, zum Beispiel `"17"` nach einer 7 hinter der 1. Dann zählt nur die neue.
 */
export function typedDigit(previous: string, value: string) {
  return previous && value.length === 2 ? value.replace(previous, "") : value;
}

/**
 * Setzt `text` ab Feld `index` ein. Mehrere Ziffern verteilen sich nach rechts, ein ganzer Code
 * füllt alle Felder, egal wo er landet. Leerer Text löscht das Feld, Text ohne Ziffern ändert
 * nichts.
 */
export function enterPartnerDigits(digits: string[], index: number, text: string): CodeEntry {
  const numbers = text.replace(/\D/g, "");
  if (!numbers) {
    const cleared = digits.map((digit, at) => (at === index ? "" : digit));
    return { digits: text ? digits : cleared, focus: index };
  }
  const start = numbers.length >= PARTNER_CODE_LENGTH ? 0 : index;
  return {
    digits: digits.map((digit, at) => numbers[at - start] ?? digit),
    focus: Math.min(start + numbers.length, PARTNER_CODE_LENGTH - 1),
  };
}

/** Rücktaste in einem leeren Feld: löscht die Ziffer davor und geht dorthin. */
export function erasePreviousDigit(digits: string[], index: number): CodeEntry {
  const focus = Math.max(index - 1, 0);
  return { digits: digits.map((digit, at) => (at === focus ? "" : digit)), focus };
}
