/**
 * Ein Fehler im Zauberladen als abgerissener Pergamentzettel mit rotem Wachs. Er hängt unter dem
 * Kopf, über allem, und lässt die Fensterknöpfe frei.
 *
 * @module
 */

import { IconButton } from "../ui";
import "./css/states.css";

/**
 * Der Zettel.
 *
 * @param onRetry - Lädt neu. Ohne gibt es keinen Knopf dafür, etwa wenn der Laden schon steht.
 * @param onClose - Nimmt den Zettel ab.
 */
export default function ShopNotice({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="shop-notice" role="alert">
      <span className="notice-wax" aria-hidden="true" />
      <strong className="notice-title">Das hat nicht geklappt.</strong>
      <p className="notice-message">{message}</p>
      {onRetry ? (
        <button type="button" className="brass-button" onClick={onRetry}>
          Erneut versuchen
        </button>
      ) : null}
      <IconButton
        icon="close"
        label="Hinweis schließen"
        className="notice-close"
        data-sound="close"
        onClick={onClose}
      />
    </div>
  );
}
