/**
 * Zoom der Karte: Mausrad, Spreizen und Knöpfe holen die Halle heran, Ziehen und Pfeiltasten oder
 * WASD verschieben den Ausschnitt, der danach ausrollt. Herangeholt folgt die Kamera dem eigenen
 * Jelly, bis man sie verschiebt. „Zu meinem Jelly“ und die Leertaste fliegen zurück. Gleiten,
 * Schwung und Flüge rechnet `@jelly/stage`.
 *
 * @module
 */

import type { ScreenPoint, StageView } from "@jelly/stage";

/** Zoom je Einheit des Mausrads. Ein Rastschritt sind rund 100 Einheiten. */
const WHEEL_ZOOM = 0.0015;
/** Zoom je Einheit beim Spreizen auf dem Trackpad. */
const PINCH_ZOOM = 0.012;
/** Zoom je Druck auf Plus oder Minus. */
const STEP_ZOOM = 1.5;
/** Ab so vielen Pixeln ist ein gedrückter Zeiger ein Ziehen und kein Klick mehr. */
const DRAG_START = 4;
/** Pixel pro Sekunde, um die eine gehaltene Taste den Ausschnitt schiebt. */
const KEY_SPEED = 700;
/** Nach einer Pause, etwa in einem verborgenen Fenster, springt der Ausschnitt nicht weit. */
const LONGEST_STEP_S = 0.1;
/** Wohin eine Taste den Ausschnitt schiebt, nach rechts und nach unten. */
const PAN_KEYS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  w: [0, -1],
  s: [0, 1],
};

/** Was der Zoom von der Seite braucht. */
export interface MapZoom {
  canvas: HTMLCanvasElement;
  /** `null`, bis die Bühne läuft. */
  readView: () => StageView | null;
}

/** Das Mausrad zoomt, auf dem Trackpad auch das Spreizen. */
function listenToWheel(zoom: MapZoom) {
  zoom.canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const point = { x: event.offsetX, y: event.offsetY };
      // Spreizen kommt als Rad mit Strg und viel kleineren Schritten.
      const speed = event.ctrlKey ? PINCH_ZOOM : WHEEL_ZOOM;
      zoom.readView()?.zoomBy(Math.exp(-event.deltaY * speed), point);
    },
    { passive: false },
  );
}

/**
 * Ziehen mit der linken Taste verschiebt, beim Loslassen schwingt der Ausschnitt aus. Der Klick am
 * Ende eines Ziehens zählt nicht, sonst ginge das Jelly danach auf einen Ausflug. Dafür muss dieser
 * Hörer vor dem der Seite angemeldet sein.
 */
function listenToDrag(zoom: MapZoom) {
  const { canvas } = zoom;
  const frame = canvas.parentElement!;
  let last: ScreenPoint | null = null;
  let isDragging = false;
  canvas.addEventListener("pointerdown", (event) => {
    last = event.button === 0 ? { x: event.offsetX, y: event.offsetY } : null;
    isDragging = false;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!last || !(event.buttons & 1)) return;
    const point = { x: event.offsetX, y: event.offsetY };
    if (!isDragging && Math.hypot(point.x - last.x, point.y - last.y) < DRAG_START) return;
    // Auch über den Knöpfen und außerhalb des Fensters geht das Ziehen weiter.
    if (!isDragging) canvas.setPointerCapture(event.pointerId);
    isDragging = true;
    frame.toggleAttribute("data-dragging", true);
    zoom.readView()?.pan(last, point);
    last = point;
  });
  const end = () => {
    last = null;
    if (!frame.hasAttribute("data-dragging")) return;
    frame.toggleAttribute("data-dragging", false);
    zoom.readView()?.releasePan();
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("click", (event) => {
    if (isDragging) event.stopImmediatePropagation();
    isDragging = false;
  });
}

/** Wohin die gehaltenen Tasten zusammen schieben. */
function sumDirections(held: Set<string>) {
  let x = 0;
  let y = 0;
  for (const key of held) {
    x += PAN_KEYS[key]?.[0] ?? 0;
    y += PAN_KEYS[key]?.[1] ?? 0;
  }
  return { x, y };
}

/**
 * Schiebt den Ausschnitt, solange Tasten gehalten sind, und lässt ihn danach ausrollen. Gibt
 * zurück, wie man eine Taste meldet.
 */
function createKeyPan(zoom: MapZoom) {
  const held = new Set<string>();
  let lastTime = 0;
  const step = (time: number) => {
    if (held.size === 0) return;
    const reach = Math.min((time - lastTime) / 1000, LONGEST_STEP_S) * KEY_SPEED;
    lastTime = time;
    const { x, y } = sumDirections(held);
    const middle = { x: zoom.canvas.clientWidth / 2, y: zoom.canvas.clientHeight / 2 };
    // Der Ausschnitt wandert nach rechts, also der Boden nach links.
    zoom.readView()?.pan(middle, { x: middle.x - x * reach, y: middle.y - y * reach });
    requestAnimationFrame(step);
  };
  const release = (keys: string[]) => {
    const wasHeld = held.size > 0;
    for (const key of keys) held.delete(key);
    if (wasHeld && held.size === 0) zoom.readView()?.releasePan();
  };
  return {
    press: (key: string) => {
      if (held.size === 0) {
        lastTime = performance.now();
        requestAnimationFrame(step);
      }
      held.add(key);
    },
    release: (key: string) => release([key]),
    releaseAll: () => release([...held]),
  };
}

/** Buchstaben zählen groß wie klein. */
function keyOf(event: KeyboardEvent): string {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

/** Plus und Minus zoomen, die Leertaste fliegt zum eigenen Jelly. Auf einem Knopf drückt sie ihn. */
function pressCameraKey(view: StageView | null, key: string, target: EventTarget | null) {
  if (key === "+" || key === "=") view?.zoomBy(STEP_ZOOM);
  else if (key === "-") view?.zoomBy(1 / STEP_ZOOM);
  else if (key === " " && !(target instanceof HTMLButtonElement)) view?.followOwn();
}

/** Pfeile und WASD verschieben, die übrigen Tasten der Kamera kennt {@link pressCameraKey}. */
function listenToKeys(zoom: MapZoom) {
  const keyPan = createKeyPan(zoom);
  window.addEventListener("keydown", (event) => {
    // In der Suche sind es Buchstaben, mit Strg oder Cmd Kürzel des Fensters.
    const isTyping = event.target instanceof HTMLInputElement;
    if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = keyOf(event);
    if (key in PAN_KEYS) {
      event.preventDefault();
      keyPan.press(key);
    } else pressCameraKey(zoom.readView(), key, event.target);
  });
  window.addEventListener("keyup", (event) => keyPan.release(keyOf(event)));
  // Ein Fenster ohne Fokus erfährt nicht, dass die Taste losgelassen wurde.
  window.addEventListener("blur", keyPan.releaseAll);
}

/** Verbindet Mausrad, Ziehen, Tasten und die Kamera-Knöpfe der Leiste mit der Bühne. */
export function listenToZoom(zoom: MapZoom): void {
  listenToWheel(zoom);
  listenToDrag(zoom);
  listenToKeys(zoom);
  const listen = (id: string, action: (view: StageView) => void) =>
    document.querySelector(id)!.addEventListener("click", () => {
      const view = zoom.readView();
      if (view) action(view);
    });
  listen("#zoom-in", (view) => view.zoomBy(STEP_ZOOM));
  listen("#zoom-out", (view) => view.zoomBy(1 / STEP_ZOOM));
  listen("#zoom-own", (view) => view.followOwn());
}
