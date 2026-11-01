/**
 * Hilfsfunktion für CSS-Klassen.
 *
 * @module
 */

/**
 * Hängt `extra` an die Basisklasse an, falls vorhanden: `cx("tile", "locked")` ergibt `"tile
 * locked"`.
 */
export const cx = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base);
