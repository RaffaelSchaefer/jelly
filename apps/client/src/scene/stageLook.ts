/**
 * Wie die Bühne des Shops ihre Jellies zeigt, als Context für die Szene: ob ein neu erscheinender
 * Sticker aufspringt, statt einfach dazustehen.
 *
 * Nur `ShopScene` setzt ihn, und erst kurz nach dem Öffnen: Was das Jelly schon trägt, springt nie
 * auf. Im Pet, in der Karte und im Studio bleibt er leer, dort erscheinen Cosmetics sofort.
 *
 * @module
 */

import { createContext } from "react";

import type { SpringTiming } from "../pet/spring";

/** Wann nach dem Erscheinen ein Sticker aufspringt und wie lange es dauert, in ms. */
export type MaterializeContextValue = SpringTiming;

/** Ob neue Sticker aufspringen. `null` lässt sie sofort erscheinen. */
export const MaterializeContext = createContext<MaterializeContextValue | null>(null);
