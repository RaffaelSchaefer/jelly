/**
 * Was die Karte beim Server auslöst: dazustellen, weggehen, Ausflug und hervorheben. Die Kamera
 * fliegt sofort hin, eine kurze Bestätigung folgt, sobald der Server zugestimmt hat.
 *
 * @module
 */

import type { StagePoint } from "@jelly/stage";

import { findName, setTarget, type MapPage } from "./page";

const TEXT_TRIP = "Dein Jelly macht einen Ausflug.";
const TEXT_BACK = "Dein Jelly geht zurück an seinen Platz.";
const TEXT_OWN_LIT = "Dein Jelly leuchtet.";

/**
 * Schickt einen Aufruf ab, bestätigt ihn und liest danach neu. Den Weg schickt der Server im
 * Stream.
 */
async function runAction(page: MapPage, action: () => Promise<string>) {
  if (page.acting) return;
  page.acting = true;
  try {
    page.notice.confirm(await action());
  } catch (cause) {
    page.notice.problem(String(cause));
  }
  page.acting = false;
  page.view?.reload();
}

/** Fliegt zu einem Jelly. Beim eigenen folgt die Kamera danach. */
export function flyToJelly(page: MapPage, playerId: number) {
  if (playerId === page.source.readOwn().id) page.view?.followOwn();
  else page.view?.flyTo(playerId);
}

/**
 * Stellt das Jelly dazu oder weg. Das beendet einen Ausflug. Das Ziel gilt sofort, damit schon der
 * nächste Klick es kennt.
 */
export function follow(page: MapPage, playerId: number | null) {
  if (playerId !== null) page.view?.flyTo(playerId);
  return runAction(page, async () => {
    const target = await page.source.setFollow(playerId);
    page.destination = null;
    setTarget(page, target);
    return target === null ? TEXT_BACK : `Dein Jelly stellt sich zu ${findName(page, target)}.`;
  });
}

/**
 * Schickt das Jelly auf einen Ausflug, der ein Dazustellen beendet. Der Zeiger steht sofort. Lehnt
 * der Server ab, räumt ihn das Neuladen danach wieder weg.
 */
export function goTo(page: MapPage, point: StagePoint) {
  return runAction(page, async () => {
    page.destination = point;
    setTarget(page, null);
    await page.source.goTo(point);
    return TEXT_TRIP;
  });
}

/** Lässt ein Jelly aufleuchten und fliegt hin. Den Lichtkegel zeichnet die Bühne mit dem Ereignis. */
export function highlight(page: MapPage, playerId: number) {
  flyToJelly(page, playerId);
  return runAction(page, async () => {
    await page.source.highlight(playerId);
    const isOwn = playerId === page.source.readOwn().id;
    return isOwn ? TEXT_OWN_LIT : `${findName(page, playerId)} leuchtet.`;
  });
}
