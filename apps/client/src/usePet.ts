/**
 * React-Hooks rund um den Spielstand: laden, Code einlösen, Aktionen ans Backend schicken,
 * Rückmeldungen des Pets, Tastatur-Stupser und der Größen-Regler.
 *
 * In der Browser-Vorschau gibt es kein Backend. Aussehen, Cosmetics und Einstellungen ändern dann
 * nur den lokalen Zustand, der Einstieg läuft ohne Server über `previewAccess`. Stupser,
 * Nasenstupser und Streicheln reagieren ohne XP, Selbstmeldungen sind gesperrt.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from "react";

import * as backend from "./backend";
import { desktop } from "./backend";
import {
  achievementTitle,
  coinLabel,
  needsCode,
  pokeWaitMinutes,
  previewAccess,
  REPORTS,
  withEquipped,
  type Action,
  type Catalog,
  type CosmeticSlot,
  type Game,
  type Me,
  type PetColor,
  type PetTouch,
  type ServerEvent,
  type Settings,
} from "./pet";
import { useEmotes } from "./useEmotes";
import { useFollow } from "./useFollow";
import {
  useBackendCall,
  useGameState,
  usePresence,
  useServerEvents,
  useStreamReset,
} from "./useGame";
import { usePartnerEmote, usePlayPartner } from "./usePartnerEmote";
import { useSigns } from "./useSigns";

/** Mindestabstand zwischen zwei Stupsern in Millisekunden, damit Tastenhämmern nichts verstopft. */
const POKE_INTERVAL_MS = 1000;
/** Was das Pet sagt, wenn der Code keinen Sitz gebracht hat. Die Orga braucht dafür die Nummer. */
const SEAT_HINT = "Einen Platz trägt mir die Orga noch ein, meine Nummer steht in der Übersicht.";

/** Was das Pet nach einem Stupser sagt, je nachdem, ob es XP gab. */
function pokeMessage(xpGained: number, after: Me | null) {
  if (xpGained > 0) return `+${xpGained} XP. Schön, dass du da bist!`;
  const wait = pokeWaitMinutes(after?.next_poke_at ?? null, after?.server_time ?? 0);
  if (wait === null) return "Gerade läuft keine LAN. Bis bald!";
  return wait > 0 ? `Hihi! Neue XP gibt’s in ${wait} min.` : "Hihi, das kitzelt!";
}

/** Was das Pet nach einer Berührung sagt. */
const TOUCH_LINES: Record<PetTouch, string> = {
  boop: "Hihi, meine Nase!",
  pet: "Mmh, das tut gut …",
};

/**
 * Was das Pet nach einer Aktion sagt, und ob es dabei ein Level aufgestiegen ist.
 *
 * @param touch - Die Berührung, mit der gestupst wurde. Sie bekommt ihren eigenen Satz.
 */
function reactionTo(action: Action, result: backend.ActResult, before: Me, touch?: PetTouch) {
  const after = result.game.me;
  if (after && after.level > before.level) {
    const coins = result.game.lan.rules.coins_per_level;
    const message =
      coins > 0
        ? `Level ${after.level}! ${coinLabel(coins)} mehr für den Shop.`
        : `Level ${after.level}! Weiter so.`;
    return { message, levelUp: true };
  }
  if (touch) {
    const line = TOUCH_LINES[touch];
    return {
      message: result.xpGained > 0 ? `+${result.xpGained} XP. ${line}` : line,
      levelUp: false,
    };
  }
  if (action === "poke") return { message: pokeMessage(result.xpGained, after), levelUp: false };
  const report = REPORTS.find((item) => item.action === action);
  return { message: report?.message ?? "Gute Runde. Ich bin dabei.", levelUp: false };
}

/** Lässt höchstens einen Stupser pro {@link POKE_INTERVAL_MS} durch und merkt sich den Zeitpunkt. */
function allowPoke(lastPoke: { current: number }) {
  const now = performance.now();
  if (now - lastPoke.current < POKE_INTERVAL_MS) return false;
  lastPoke.current = now;
  return true;
}

/** Ob eine Aktion jetzt losgehen darf. In der Vorschau ohne Server gibt es nur den Stupser, ohne XP. */
function mayAct(action: Action, lastPoke: { current: number }) {
  if (!desktop && action !== "poke") return false;
  return action !== "poke" || allowPoke(lastPoke);
}

/** Was das Pet zu einem Ereignis vom Server sagt, oder `null`, wenn es still bleibt. */
function eventMessage(event: ServerEvent, catalog: Catalog) {
  const payload = event.payload ?? {};
  if (event.type === "achievement.earned")
    return `Neuer Erfolg: ${achievementTitle(String(payload.key), catalog, null)}!`;
  if (event.type === "award.given") return `Die Orga ehrt mich: ${String(payload.title)}.`;
  if (event.type === "player.hidden") return "Die Orga hat mich gerade von der Bühne genommen.";
  return coinsMessage(event);
}

/**
 * Was das Pet zu Münzen sagt, die nicht aus einem Aufstieg kommen. Den Aufstieg feiert es schon
 * selbst, und ein Kauf zahlt ohne Ereignis.
 */
function coinsMessage(event: ServerEvent) {
  if (event.type !== "coins.gained") return null;
  const coins = coinLabel(Number(event.payload?.amount ?? 0));
  if (event.payload?.source === "admin") return `Die Orga schenkt mir ${coins}!`;
  if (event.payload?.source === "refund")
    return `${coins} zurück, die Orga hat einen Kauf storniert.`;
  return null;
}

/** Der Weg in die LAN: Code einlösen oder ein Konto zurückholen. */
function useAccess(
  setGame: (game: Game) => void,
  run: ReturnType<typeof useBackendCall>["run"],
  setMessage: (text: string) => void,
) {
  // Im selben Takt wie der neue Stand: Sonst stünde für ein Bild schon das Dock da. Gesetzt nur hier
  // beim Einlösen: Auch das Ende einer LAN nimmt die Frage nach dem Code weg, ohne dass jemand schlüpft.
  const [hatching, setHatching] = useState(false);
  const endHatch = useCallback(() => setHatching(false), []);

  /**
   * Löst einen LAN- oder Sitzplatz-Code ein. Ohne Konto entsteht mit Name und Farbe ein neues,
   * sonst nimmt das vorhandene teil. `true`, wenn der Code gegolten hat.
   */
  const redeemAccess = useCallback(
    async (code: string, name?: string, color?: PetColor) => {
      const result = await run(() =>
        desktop ? backend.redeemAccess(code, name, color) : previewAccess(code, name, color),
      );
      if (!result) return false;
      setGame(result.game);
      setHatching(!needsCode(result.game));
      const greeting = name ? `Hallo, ich bin ${result.game.me?.name ?? name}!` : "Ich bin dabei!";
      setMessage(
        result.seatAssigned ? `${greeting} Mein Platz steht.` : `${greeting} ${SEAT_HINT}`,
      );
      return true;
    },
    [run, setGame, setMessage],
  );

  /**
   * Holt das Konto mit einem Wiederherstellungs-Code zurück. Das alte Secret gilt danach nicht
   * mehr. `true`, wenn der Code gegolten hat.
   */
  const recoverAccess = useCallback(
    async (code: string) => {
      const next = await run(async () =>
        desktop ? backend.recoverAccess(code) : (await previewAccess(code)).game,
      );
      if (!next) return false;
      setGame(next);
      setHatching(!needsCode(next));
      setMessage(`Da bin ich wieder, ${next.me?.name ?? "du"}!`);
      return true;
    },
    [run, setGame, setMessage],
  );

  return { hatching, endHatch, redeemAccess, recoverAccess };
}

/** Laden, Code einlösen und die Ereignisse vom Server. */
function useAccount(state: ReturnType<typeof useGameState>, onLevelUp: () => void) {
  const { setGame, setCatalog, catalog, reload } = state;
  const [ready, setReady] = useState(!desktop);
  const [said, setSaid] = useState({ text: "Bereit für die nächste Runde.", id: 0 });
  // Mit Zähler: Auch derselbe Satz ist eine neue Meldung, das Jelly spricht ihn dann noch einmal.
  const setMessage = useCallback(
    (text: string) => setSaid((last) => ({ text, id: last.id + 1 })),
    [],
  );
  const call = useBackendCall(reload);
  const { run } = call;

  /** Lädt Stand und Katalog. Auch für „Erneut versuchen“, falls das Laden scheitert. */
  const load = useCallback(async () => {
    if (!desktop) return;
    const loaded = await run(() => Promise.all([backend.getGame(), backend.getCatalog()]), false);
    if (!loaded) return;
    setGame(loaded[0]);
    setCatalog(loaded[1]);
    setReady(true);
  }, [run, setGame, setCatalog]);
  useEffect(() => void load(), [load]);

  const access = useAccess(setGame, run, setMessage);

  const onEvent = useCallback(
    (event: ServerEvent) => {
      const reloaded = reload();
      const text = eventMessage(event, catalog);
      if (text) setMessage(text);
      // Erst mit dem neuen Stand: Der Aufstieg zeigt das neue Level und läuft mit der Fanfare los.
      if (event.type === "level.up") void reloaded.then(onLevelUp);
    },
    [reload, catalog, onLevelUp, setMessage],
  );
  useServerEvents(desktop && ready, onEvent);
  useStreamReset(desktop && ready, reload);
  const { game } = state;
  usePresence(desktop && ready && !!game.me?.lan?.active && game.lan.joined === true, setGame);

  return {
    ...call,
    ready,
    message: said.text,
    messageId: said.id,
    setMessage,
    load,
    ...access,
  };
}

/**
 * Stupser und Selbstmeldungen samt Reaktion. `pulse` steigt mit jedem Hüpfer, `touched` hält die
 * letzte Berührung mit eigener Reaktion.
 */
function useInteract(
  { game, setGame }: ReturnType<typeof useGameState>,
  { ready, inFlight, run, setMessage }: ReturnType<typeof useAccount>,
  onLevelUp: () => void,
) {
  const [pulse, setPulse] = useState(0);
  const [touched, setTouched] = useState<{ touch: PetTouch; at: number } | null>(null);
  const lastPoke = useRef(-POKE_INTERVAL_MS);

  /**
   * Stupser oder Selbstmeldung. Danach reagiert das Pet mit Sprechblase und Hüpfer, nach einem
   * Stupser per Berührung (`touch`) mit deren eigener Reaktion statt des Hüpfers.
   */
  const interact = useCallback(
    async (action: Action, touch?: PetTouch) => {
      const before = game.me;
      if (!ready || !before || inFlight.current || !mayAct(action, lastPoke)) return;
      const result = desktop ? await run(() => backend.act(action)) : { game, xpGained: 0 };
      if (!result) return;
      setGame(result.game);
      const reaction = reactionTo(action, result, before, touch);
      setMessage(reaction.message);
      if (touch) setTouched({ touch, at: performance.now() });
      else setPulse((value) => value + 1);
      if (reaction.levelUp) onLevelUp();
    },
    [ready, game, inFlight, run, setGame, setMessage, onLevelUp],
  );
  return { pulse, setPulse, touched, interact };
}

/**
 * Hält den Spielstand und alles, was die Oberfläche damit tun kann.
 *
 * @param onLevelUp - Wird nach einem Levelaufstieg aufgerufen, zum Beispiel um ihn auf der Bühne zu
 *   zeigen. Sollte stabil sein (`useCallback`), sonst entstehen die Aktionen bei jedem Rendern
 *   neu.
 */
export function usePet(onLevelUp: () => void) {
  const state = useGameState();
  const account = useAccount(state, onLevelUp);
  const { game, setGame, patchGame, catalog } = state;
  const { ready, inFlight, run, setMessage } = account;
  const { pulse, setPulse, touched, interact } = useInteract(state, account, onLevelUp);

  /** Ein Event-Code, Schild, Standort oder Partner: Das Jelly hüpft und sagt etwas dazu. */
  const hopAndSay = useCallback(
    (text: string) => {
      setMessage(text);
      setPulse((value) => value + 1);
    },
    [setMessage],
  );

  /** Löst einen Event-Code ein. `true`, wenn es geklappt hat. */
  const redeem = useCallback(
    async (code: string) => {
      const result = await run(() => backend.redeemCode(code));
      if (!result) return false;
      setGame(result.game);
      hopAndSay(`${result.title}: +${result.xpGained} XP!`);
      return true;
    },
    [run, setGame, hopAndSay],
  );

  const look = useLook({ patchGame, setGame, run, inFlight, setMessage });
  const emotes = useEmotes(state, account, ready);
  const signs = useSigns(state, account, ready, hopAndSay);
  useFollow(state, ready, hopAndSay);
  // Ohne Hüpfer: Er stapelte sich mit dem Duett und holte die Hände heraus.
  const playPartner = usePlayPartner(emotes.showEmote, setMessage);
  const partner = usePartnerEmote(state, account, ready, { play: playPartner, say: setMessage });
  return {
    ...account,
    game,
    catalog,
    offset: state.offset,
    pulse,
    touched,
    hopAndSay,
    interact,
    redeem,
    ...look,
    ...emotes,
    ...signs,
    ...partner,
  };
}

/** Was {@link useLook} braucht. */
interface LookContext {
  patchGame: ReturnType<typeof useGameState>["patchGame"];
  setGame: (game: backend.ActResult["game"]) => void;
  run: ReturnType<typeof useBackendCall>["run"];
  inFlight: { current: boolean };
  setMessage: (message: string) => void;
}

/** Name, Farbe, Cosmetics und Geräte-Einstellungen. In der Vorschau nur lokal. */
function useLook({ patchGame, setGame, run, inFlight, setMessage }: LookContext) {
  /** Übernimmt Name und/oder Farbe. `true`, wenn es geklappt hat. */
  const customize = useCallback(
    async (patch: backend.ProfilePatch) => {
      if (!desktop) {
        patchGame((current) => ({ ...current, me: current.me && { ...current.me, ...patch } }));
        return true;
      }
      const next = await run(() => backend.updateProfile(patch));
      if (!next) return false;
      setGame(next);
      setMessage(patch.name ? "So heiße ich jetzt." : "So gefällt’s mir.");
      return true;
    },
    [patchGame, run, setGame, setMessage],
  );

  /**
   * Legt ein Cosmetic auf seinen Platz oder leert den Platz mit `null`. Ohne `color` sieht ein
   * einfärbbares aus wie modelliert, dasselbe Cosmetic mit Farbe färbt es um.
   */
  const equip = useCallback(
    async (slot: CosmeticSlot, key: string | null, color?: string) => {
      if (!desktop) {
        patchGame((current) => ({
          ...current,
          me: current.me && {
            ...current.me,
            equipped: withEquipped(current.me.equipped, slot, key, color),
          },
        }));
        return;
      }
      const next = await run(() => backend.equipCosmetic(slot, key, color));
      if (next) setGame(next);
      if (next) setMessage(key ? "Steht mir, oder?" : "Wieder ganz natürlich.");
    },
    [patchGame, run, setGame, setMessage],
  );

  /** Übernimmt Größe und Bewegung. `false` heißt: gerade beschäftigt, später erneut versuchen. */
  const saveSettings = useCallback(
    async (settings: Settings) => {
      if (inFlight.current) return false;
      if (!desktop) patchGame((current) => ({ ...current, settings }));
      else {
        const next = await run(() => backend.updateSettings(settings));
        if (next) setGame(next);
      }
      return true;
    },
    [inFlight, patchGame, run, setGame],
  );

  return { customize, equip, saveSettings };
}

/** Alles, was {@link usePet} liefert. */
export type PetGame = ReturnType<typeof usePet>;

/** Elemente, in denen Tasten eine eigene Bedeutung haben. Dort stupst ein Tastendruck nicht. */
const EDITABLE = 'input, textarea, button, select, [contenteditable="true"]';

/**
 * Stupst das Pet bei Tastendruck im Pet-Fenster an (Leertaste oder ein druckbares Zeichen).
 * Ausgenommen sind wiederholte Tasten, Kürzel mit Strg/Alt/Cmd und Eingaben in Bedienelementen.
 *
 * @param enabled - Nur aktiv, wenn kein Panel offen ist.
 */
export function usePokeKeys(interact: (action: Action) => unknown, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if ((event.target as HTMLElement).closest(EDITABLE)) return;
      if (event.code === "Space" || event.key.length === 1) void interact("poke");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interact, enabled]);
}

/**
 * Entwurfswert für einen Regler in den Einstellungen. Er zeigt sofort den neuen Wert, gespeichert
 * wird erst 400 ms nach der letzten Bewegung.
 *
 * @param saved - Gespeicherter Wert, solange es keinen Entwurf gibt.
 * @param save - Speichert einen Wert. `false` heißt: gerade beschäftigt, dann in 200 ms erneut.
 * @returns Der anzuzeigende Wert und die Funktion für `onChange`.
 */
export function useSettingDraft(saved: number, save: (value: number) => Promise<boolean>) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function change(next: number) {
    setDraft(next);
    window.clearTimeout(timer.current);
    const attempt = async () => {
      if (!(await save(next))) {
        timer.current = window.setTimeout(attempt, 200);
        return;
      }
      // Nur zurücksetzen, wenn der Regler inzwischen nicht schon woanders steht.
      setDraft((current) => (current === next ? null : current));
    };
    timer.current = window.setTimeout(attempt, 400);
  }

  return [draft ?? saved, change] as const;
}
