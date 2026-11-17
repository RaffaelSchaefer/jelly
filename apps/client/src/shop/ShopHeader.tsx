/**
 * Der Kopf des Zauberladens: Griff und Fensterknöpfe als Messingknäufe, die Lederbörse und das
 * Messingschild mit dem Namen. Am Schild lässt sich das Fenster auch verschieben.
 *
 * @module
 */

import type { WindowAction } from "../backend";
import type { PurseProps } from "./ShopPurse";

import { WindowTools } from "../WindowChrome";
import ShopPurse from "./ShopPurse";
import "./css/frame.css";

/** Ein kleiner Stern links und rechts der Inschrift. Als SVG: Cinzel kennt keine Sterne. */
function PlaqueStar() {
  return (
    <svg className="plaque-star" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M4 0 5 3 8 4 5 5 4 8 3 5 0 4 3 3Z" />
    </svg>
  );
}

/**
 * Der Kopf.
 *
 * @param purse - Die Börse, ohne Jelly `null`.
 */
export default function ShopHeader({
  onWindow,
  purse,
}: {
  onWindow: (action: WindowAction) => void;
  purse: PurseProps | null;
}) {
  return (
    <header className="shop-head">
      <WindowTools name="Zauberladen" quietClose onAction={onWindow} />
      {purse ? <ShopPurse {...purse} /> : null}
      <h1
        id="shop-title"
        className="shop-plaque"
        onPointerDown={(event) => {
          if (event.button === 0) onWindow("drag");
        }}
      >
        <PlaqueStar />
        Zauberladen
        <PlaqueStar />
      </h1>
    </header>
  );
}
