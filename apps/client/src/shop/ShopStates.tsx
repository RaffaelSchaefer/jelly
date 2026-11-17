/**
 * Was der Zauberladen zeigt, bevor er öffnet: ein stilles Gerüst aus Tintenlinien, solange Rust
 * noch lädt, und ein Brief, wenn es kein Jelly gibt, das etwas anprobieren könnte.
 *
 * @module
 */

import "./css/states.css";

/** Vier Zeilen Tinte, wo später die Waren stehen. */
const INK_ROWS = [0, 1, 2, 3].map((row) => <span key={row} className="skeleton-row" />);

/** Das Gerüst, solange der Laden lädt. Die Seite trägt dabei `aria-busy`. */
export function ShopSkeleton() {
  return (
    <>
      <div className="skeleton-stage" aria-hidden="true">
        <span>Der Zauberer schließt auf …</span>
      </div>
      <div className="shop-ledger skeleton-ledger" aria-hidden="true">
        <div className="ledger-paper">{INK_ROWS}</div>
      </div>
      <div className="shop-brief skeleton-brief" aria-hidden="true">
        <div className="brief-letter" />
      </div>
      <p className="sr-only" role="status">
        Der Laden öffnet …
      </p>
    </>
  );
}

/**
 * Der Brief ohne Jelly.
 *
 * @param onLeave - Schließt das Fenster. In der Vorschau fehlt es, der Knopf bleibt dann gesperrt.
 */
export function NoJellyLetter({ onLeave }: { onLeave?: () => void }) {
  return (
    <section className="shop-letter" aria-labelledby="letter-title">
      <h2 id="letter-title">Ohne Jelly gibt es nichts anzuprobieren.</h2>
      <p>Löse im Pet-Fenster einen Code ein.</p>
      <button
        type="button"
        className="brass-button"
        disabled={!onLeave}
        title={onLeave ? undefined : "Nur in der App"}
        onClick={onLeave}
      >
        Laden verlassen
      </button>
    </section>
  );
}
