/**
 * Die Sinne des Zauberers: Sie machen aus dem Fenster Ereignisse für sein Gehirn. Was der Zeiger
 * oder der Fokus berührt (`[data-item-id]`, `[data-gaze]`), Stupser (`[data-wizard-poke]`), Griffe
 * an Hut und Bart (`[data-wizard-tease]`), das gesperrte Siegel (`#shop-seal[aria-disabled=true]`),
 * ob jemand da ist (Zeiger, Klick, Taste, Mausrad), ob das Fenster zu sehen ist, Ereignisse vom
 * Server, wer seinen Hut trägt, und was er über Laden, Kundschaft und Uhrzeit weiß.
 *
 * Alle Hörer hängen einmal am Dokument und suchen ihr Ziel selbst, so braucht die Oberfläche keine
 * eigenen Rückrufe. In der Vorschau spielt `#shop-nacht` die Nacht.
 *
 * @module
 */

import { COSMETIC_MODEL_KEYS } from "@jelly/scene/cosmetic-keys";
import { useCallback, useEffect } from "react";

import type { Me, ServerEvent } from "../pet/types";
import type { WizardContext, WizardEvent } from "../pet/wizardScripts";

import { desktop } from "../backend";
import { previewGiftEvents, previewShop } from "../pet/preview";
import { type ShopItem } from "../pet/shop";
import { serverHat } from "../pet/wizardHat";
import { useServerEvents } from "../useGame";

/** Was der Zauberer über den Laden erfährt, sobald der Shop es ihm gibt. */
export interface WizardWorld {
  me: Me | null;
  items: readonly ShopItem[];
  /** Ob eine LAN läuft und der Laden verkauft. */
  open: boolean;
  /** Münzen je Level-Aufstieg. */
  perLevel: number;
  xpPerLevel: number;
  /** `server_time - Date.now()`: So weit geht die Uhr des Servers vor. */
  serverOffset: number;
}

/** Wie er Ereignisse bekommt. */
type Dispatch = (event: WizardEvent) => void;

/** So weit muss sich der Zeiger bewegen, damit er als da zählt, und höchstens so oft. */
const MOVE = { px: 4, everyMs: 500 } as const;

/** So lange nach dem Mausrad zählt kein Verweilen: Die Rolle scrollt unter dem Zeiger. */
const WHEEL_QUIET_MS = 300;

/** Die Stunde der Nacht für `#shop-nacht`. */
const PREVIEW_NIGHT = 23;

/** Die Ortszeit in Stunden, in der Vorschau mit `#shop-nacht` mitten in der Nacht. */
function localHour() {
  if (!desktop && location.hash === "#shop-nacht") return PREVIEW_NIGHT;
  return new Date().getHours();
}

/** Das Ziel unter Zeiger oder Fokus: eine Ware, das Siegel oder die Börse. */
function senseTarget(target: EventTarget | null) {
  return target instanceof Element ? target.closest("[data-item-id], [data-gaze]") : null;
}

/** Was das Verweilen auf `element` bedeutet. Die Rolle als Ganzes zählt nicht, nur ihre Waren. */
function hoverOf(element: Element | null): WizardEvent {
  const gaze = element?.getAttribute("data-gaze");
  const itemId = element?.getAttribute("data-item-id") ?? undefined;
  if (gaze === "seal") return { kind: "hover", target: "seal", itemId };
  if (gaze === "purse") return { kind: "hover", target: "purse" };
  if (gaze === "wizard") return { kind: "hover", target: "wizard" };
  return itemId ? { kind: "hover", target: "item", itemId } : { kind: "unhover" };
}

/**
 * Was ein Klick bedeutet: ein Griff an Hut oder Bart, ein Stupser, ein Griff nach dem gesperrten
 * Siegel oder nichts.
 */
function clickOf(target: EventTarget | null): WizardEvent | null {
  if (!(target instanceof Element)) return null;
  const tease = target.closest("[data-wizard-tease]")?.getAttribute("data-wizard-tease");
  if (tease === "hat" || tease === "beard") return { kind: "tease", target: tease };
  if (target.closest("[data-wizard-poke]")) return { kind: "poke" };
  const seal = target.closest("#shop-seal[aria-disabled='true']");
  if (!seal) return null;
  return { kind: "blocked", itemId: seal.getAttribute("data-item-id") ?? undefined };
}

/** Zeiger und Fokus: Verweilen, Stupser und das gesperrte Siegel. */
function usePointing(dispatch: Dispatch) {
  useEffect(() => {
    let current: Element | null = null;
    let wheelAt = -Infinity;
    const move = (target: EventTarget | null) => {
      const element = senseTarget(target);
      if (element === current || performance.now() - wheelAt < WHEEL_QUIET_MS) return;
      current = element;
      dispatch(hoverOf(element));
    };
    const over = (event: Event) => move(event.target);
    const out = (event: PointerEvent | FocusEvent) => move(event.relatedTarget);
    const wheel = () => {
      wheelAt = performance.now();
      if (current) dispatch({ kind: "unhover" });
      current = null;
    };
    const click = (event: MouseEvent) => {
      const notice = clickOf(event.target);
      if (notice) dispatch(notice);
    };
    const listeners = {
      pointerover: over,
      focusin: over,
      pointerout: out,
      focusout: out,
      wheel,
      click,
    };
    for (const [type, listener] of Object.entries(listeners)) {
      document.addEventListener(type, listener as EventListener, { passive: true });
    }
    return () => {
      for (const [type, listener] of Object.entries(listeners)) {
        document.removeEventListener(type, listener as EventListener);
      }
    };
  }, [dispatch]);
}

/**
 * Ob jemand da ist: Klick und Taste wecken ihn, Zeiger (ab 4 px, höchstens alle 500 ms) und Mausrad
 * zählen nur als Anwesenheit.
 */
function usePresence(dispatch: Dispatch) {
  useEffect(() => {
    let last: { x: number; y: number; at: number } | null = null;
    const strong = () => dispatch({ kind: "input", strong: true });
    const weak = () => dispatch({ kind: "input", strong: false });
    const move = ({ clientX: x, clientY: y }: PointerEvent) => {
      const now = performance.now();
      const near = last && Math.hypot(x - last.x, y - last.y) < MOVE.px;
      if (last && (near || now - last.at < MOVE.everyMs)) return;
      last = { x, y, at: now };
      weak();
    };
    const listeners = { pointerdown: strong, keydown: strong, wheel: weak, pointermove: move };
    for (const [type, listener] of Object.entries(listeners)) {
      window.addEventListener(type, listener as EventListener, { capture: true, passive: true });
    }
    return () => {
      for (const [type, listener] of Object.entries(listeners)) {
        window.removeEventListener(type, listener as EventListener, { capture: true });
      }
    };
  }, [dispatch]);
}

/** Ob das Fenster zu sehen ist. Kommt es zurück, schaut er auch auf die Uhr. */
function useVisibility(dispatch: Dispatch) {
  useEffect(() => {
    const change = () => {
      if (document.hidden) {
        dispatch({ kind: "hidden" });
        return;
      }
      dispatch({ kind: "context", patch: { hour: localHour() } });
      dispatch({ kind: "visible" });
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, [dispatch]);
}

/** Ob `me` schon einmal gekauft hat: eine Ware aus dem Laden oder der Erfolg dafür. */
function isRegular(me: Me, items: readonly ShopItem[]) {
  const bought = items.some((item) => item.state === "owned");
  return bought || me.achievements.some((earned) => earned.key === "first-purchase");
}

/** Was der Laden über Kundschaft und Waren weiß. */
export function worldContext(world: Omit<WizardWorld, "serverOffset">): Partial<WizardContext> {
  const { me, items } = world;
  return {
    name: me?.name ?? null,
    coins: me?.coins ?? null,
    xp: me?.xp ?? null,
    xpPerLevel: world.xpPerLevel,
    perLevel: world.perLevel,
    open: world.open,
    items,
    worn: me ? Object.values(me.equipped).map((worn) => worn.key) : null,
    regular: me ? isRegular(me, items) : null,
  };
}

/** Was er weiß: Uhrzeit, Modelle, ruhige Bewegung und alles, was der Laden über sich weiß. */
function useKnowledge(dispatch: Dispatch, calm: boolean, world: WizardWorld) {
  useEffect(() => {
    dispatch({ kind: "context", patch: { hour: localHour(), modelKeys: COSMETIC_MODEL_KEYS } });
  }, [dispatch]);
  useEffect(() => dispatch({ kind: "context", patch: { calm } }), [dispatch, calm]);
  const { me, items, open, perLevel, xpPerLevel } = world;
  useEffect(() => {
    const patch = worldContext({ me, items, open, perLevel, xpPerLevel });
    dispatch({ kind: "context", patch });
  }, [dispatch, me, items, open, perLevel, xpPerLevel]);
}

/**
 * Sagt ihm bei jedem neuen Stand, wer seinen Hut trägt und wie lange noch. Nur ein anderer Träger
 * oder eine andere Rückkehr zählt, ein Stand ohne Änderung schweigt.
 */
function useServerHat(dispatch: Dispatch, { me, serverOffset }: WizardWorld) {
  const { holder_id: holder, ends_at: endsAt } = me?.wizard_hat ?? {};
  const id = me?.id;
  useEffect(() => {
    if (!me) return;
    dispatch({ kind: "hatServer", hat: serverHat(me, Date.now() + serverOffset) });
    // Nur Träger und Rückkehr zählen: Der Abstand zur Uhr wackelt bei jedem Stand um Millisekunden.
  }, [dispatch, id, holder, endsAt]);
}

/** Die Vorschau schickt mit `#shop-muenzen` kurz vor ihrem Aufstieg, was der Server melden würde. */
const PREVIEW_GIFT_MS = desktop ? null : previewShop(location.hash).giftMs;

/**
 * Ereignisse vom Server, solange das Shop-Fenster offen ist. Nur mit Backend, in der Vorschau
 * spielt `#shop-muenzen` Münzen und Aufstieg vor, kurz bevor die Börse sie zeigt.
 */
function useServer(dispatch: Dispatch, world: WizardWorld) {
  const onEvent = useCallback(
    (event: ServerEvent) => dispatch({ kind: "server", event }),
    [dispatch],
  );
  useServerEvents(desktop, onEvent);
  const level = world.me?.level ?? 0;
  const { perLevel } = world;
  useEffect(() => {
    if (PREVIEW_GIFT_MS === null) return;
    const send = () => previewGiftEvents(level, perLevel).forEach(onEvent);
    const timer = window.setTimeout(send, Math.max(0, PREVIEW_GIFT_MS - 50));
    return () => window.clearTimeout(timer);
    // Einmal beim Öffnen, wie der Aufstieg der Vorschau selbst.
  }, [onEvent]);
}

/**
 * Hängt die Sinne an Fenster und Dokument.
 *
 * @param dispatch - Sollte stabil sein.
 * @param calm - Reduzierte Bewegung: kein Leerlauf.
 * @param world - Was der Laden über Kundschaft und Waren weiß.
 */
export function useWizardSenses(dispatch: Dispatch, calm: boolean, world: WizardWorld) {
  usePointing(dispatch);
  usePresence(dispatch);
  useVisibility(dispatch);
  useKnowledge(dispatch, calm, world);
  useServerHat(dispatch, world);
  useServer(dispatch, world);
}
