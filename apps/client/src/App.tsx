import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  COSMETICS,
  levelProgress,
  PET_SIZE,
  PREVIEW_PET,
  stageLayout,
  type Action,
  type Pet,
  type PetColor,
} from "./pet";
import {
  ColorChoice,
  Dock,
  DockButton,
  ErrorAlert,
  IconButton,
  Panel,
  PrimaryButton,
  SizeSlider,
  SpeechBubble,
  Tabs,
  TextField,
  ToggleRow,
} from "./ui";
import {
  Achievements,
  Cosmetics,
  LevelUp,
  Overview,
  REPORTS,
  XP_TABS,
  type XpTab,
} from "./XpPanel";

const PetScene = lazy(() => import("./PetScene"));
const desktop = isTauri();
type Panel = "lan" | "levelup" | "look" | "settings" | null;
const unixNow = () => Math.floor(Date.now() / 1000);

type Save = (name: string, color: PetColor, reducedMotion: boolean, size: number) => void;

function Appearance({ pet, disabled, onSave }: { pet: Pet; disabled: boolean; onSave: Save }) {
  const [name, setName] = useState(pet.name);
  const [color, setColor] = useState(pet.color);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(name, color, pet.reducedMotion, pet.size);
  }
  return (
    <form onSubmit={submit}>
      <TextField
        id="pet-name"
        label="Wie heißt dein Begleiter?"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={24}
        required
        autoComplete="off"
      />
      <ColorChoice value={color} onChange={setColor} />
      <PrimaryButton disabled={disabled || !name.trim()} type="submit">
        {desktop ? "Übernehmen" : "In der Vorschau ansehen"}
      </PrimaryButton>
    </form>
  );
}

export default function App() {
  const [pet, setPet] = useState<Pet>(PREVIEW_PET);
  const [panel, setPanel] = useState<Panel>(null);
  const [ready, setReady] = useState(!desktop);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Bereit für die nächste Runde.");
  const [pulse, setPulse] = useState(0);
  const [sizeDraft, setSizeDraft] = useState<number | null>(null);
  const [xpTab, setXpTab] = useState<XpTab>("overview");
  const [now, setNow] = useState(unixNow);
  const sizeSave = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  const lastInput = useRef(-1000);
  const osReducedMotion = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const progress = levelProgress(pet.xp);
  const size = sizeDraft ?? pet.size;
  const layout = stageLayout(size);

  const load = useCallback(async () => {
    if (!desktop) return;
    setError("");
    try {
      setPet(await invoke<Pet>("get_pet"));
      setReady(true);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  // The UI theme (accent, panels, bubble) follows the pet's colour.
  useEffect(() => {
    document.documentElement.dataset.petColor = pet.color;
  }, [pet.color]);
  // Cooldowns count down while the XP panel is open.
  useEffect(() => {
    if (panel !== "lan") return;
    setNow(unixNow());
    const timer = window.setInterval(() => setNow(unixNow()), 15_000);
    return () => window.clearInterval(timer);
  }, [panel]);

  const interact = useCallback(
    async (action: Action) => {
      if (!ready || !desktop || inFlight.current) return;
      if (action === "activity" && performance.now() - lastInput.current < 1000) return;
      if (action === "activity") lastInput.current = performance.now();
      inFlight.current = true;
      setBusy(true);
      setError("");
      try {
        const next = await invoke<Pet>("interact", { action });
        const level = levelProgress(next.xp).level;
        if (level > levelProgress(pet.xp).level) {
          const unlocked = COSMETICS.find(
            (item) => "level" in item.unlock && item.unlock.level === level,
          );
          setMessage(
            unlocked
              ? `Level ${level}! Neu für mich: ${unlocked.name}.`
              : `Level ${level}! Weiter so.`,
          );
          setPanel("levelup");
        } else
          setMessage(
            REPORTS.find((item) => item.action === action)?.message ?? "Gute Runde. Ich bin dabei.",
          );
        setPet(next);
        setNow(unixNow());
        setPulse((value) => value + 1);
      } catch (cause) {
        setError(String(cause));
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [ready, pet.xp],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || panel !== null) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, button, select, [contenteditable="true"]')) return;
      if (event.code === "Space" || event.key.length === 1) void interact("activity");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interact, panel]);

  async function customize(name: string, color: PetColor, reducedMotion: boolean, size: number) {
    if (inFlight.current) return;
    if (!desktop) {
      setPet((current) => ({ ...current, name: name.trim(), color, reducedMotion, size }));
      setMessage("Vorschau angepasst. Es wird nichts gespeichert.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      setPet(await invoke<Pet>("customize_pet", { name, color, reducedMotion, size }));
      setMessage("So gefällt’s mir.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function equip(cosmetic: string | null) {
    if (inFlight.current) return;
    if (!desktop) {
      setPet((current) => ({ ...current, cosmetic }));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      setPet(await invoke<Pet>("equip_cosmetic", { cosmetic }));
      setMessage(cosmetic ? "Steht mir, oder?" : "Wieder ganz natürlich.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // The slider resizes him live; the new size is saved once it stops moving.
  function changeSize(next: number) {
    setSizeDraft(next);
    window.clearTimeout(sizeSave.current);
    const save = () => {
      if (inFlight.current) {
        sizeSave.current = window.setTimeout(save, 200);
        return;
      }
      void customize(pet.name, pet.color, pet.reducedMotion, next).finally(() =>
        setSizeDraft((draft) => (draft === next ? null : draft)),
      );
    };
    sizeSave.current = window.setTimeout(save, 400);
  }
  useEffect(() => () => window.clearTimeout(sizeSave.current), []);

  async function windowAction(action: "drag" | "minimize" | "close") {
    if (!desktop) return;
    try {
      const current = getCurrentWindow();
      if (action === "drag") await current.startDragging();
      else if (action === "minimize") await current.minimize();
      else await current.close();
    } catch (cause) {
      setError(String(cause));
    }
  }

  function toggle(next: Panel) {
    setPanel((current) => (current === next ? null : next));
  }

  return (
    <>
      {!desktop ? (
        <header className="preview-header">
          <img src="/pet.svg" width="32" height="32" alt="" />
          <div>
            <strong>LAN Desk Pet</strong>
            <span>Umwelt-Campus Birkenfeld · November 2026</span>
          </div>
          <span className="preview-label">Browser-Vorschau</span>
        </header>
      ) : null}
      <main
        className="pet-window"
        aria-label="Dein LAN-Begleiter"
        style={
          {
            "--pet-scale": layout.scale,
            "--stage-height": `${layout.stage}px`,
            "--canvas-top": `${layout.canvas.top}px`,
            "--canvas-width": `${layout.canvas.width}px`,
            "--canvas-height": `${layout.canvas.height}px`,
            "--feet": `${layout.feet}px`,
            "--bubble-top": `${layout.bubbleTop}px`,
            "--tools-offset": `${layout.toolsOffset}px`,
          } as React.CSSProperties
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") setPanel(null);
        }}
      >
        <div className="window-tools">
          <IconButton
            icon="drag"
            label="Pet-Fenster verschieben"
            className="drag-handle"
            title={desktop ? "Fenster verschieben" : "Im Desktop-Modus verschiebbar"}
            disabled={!desktop}
            onPointerDown={(event) => {
              if (event.button === 0) void windowAction("drag");
            }}
          />
          <div className="window-tools-right">
            <IconButton
              icon="minus"
              label="Minimieren"
              disabled={!desktop}
              onClick={() => void windowAction("minimize")}
            />
            <IconButton
              icon="close"
              label="Schließen"
              disabled={!desktop}
              onClick={() => void windowAction("close")}
            />
          </div>
        </div>

        <div className="pet-stage">
          <SpeechBubble>{message}</SpeechBubble>
          <button
            className="pet-touch"
            aria-label={`${pet.name} anstupsen`}
            disabled={!desktop || !ready || busy}
            onClick={() => void interact("activity")}
          >
            <Suspense
              fallback={<span className="render-fallback">Dein Begleiter wacht auf …</span>}
            >
              <PetScene
                color={pet.color}
                cosmetic={pet.cosmetic}
                pulse={pulse}
                reducedMotion={pet.reducedMotion || osReducedMotion.current}
              />
            </Suspense>
          </button>
          <div className="ground-shadow" />
          <h1 className="sr-only">
            {pet.name}, Level {progress.level}
          </h1>
        </div>

        <section className="pet-controls" aria-label="Pet-Steuerung">
          {panel ? (
            <Panel
              title={
                panel === "lan"
                  ? XP_TABS.find((tab) => tab.id === xpTab)!.title
                  : panel === "levelup"
                    ? `${pet.name} ist eine Stufe weiter.`
                    : panel === "look"
                      ? "Ganz dein Begleiter."
                      : "Ein bisschen Feintuning."
              }
              onClose={() => setPanel(null)}
            >
              {panel === "lan" ? (
                <>
                  <Tabs label="Bereiche" tabs={XP_TABS} value={xpTab} onChange={setXpTab} />
                  {xpTab === "overview" ? (
                    <Overview
                      pet={pet}
                      now={now}
                      disabled={!desktop || !ready || busy}
                      onReport={(action) => void interact(action)}
                    />
                  ) : null}
                  {xpTab === "cosmetics" ? (
                    <Cosmetics
                      pet={pet}
                      disabled={busy || !ready}
                      onEquip={(id) => void equip(id)}
                    />
                  ) : null}
                  {xpTab === "achievements" ? <Achievements pet={pet} /> : null}
                  {!desktop && xpTab === "overview" ? (
                    <p className="panel-note">Melden geht in der Desktop-App.</p>
                  ) : null}
                </>
              ) : null}
              {panel === "levelup" ? (
                <LevelUp
                  pet={pet}
                  disabled={busy || !ready}
                  onEquip={(id) => {
                    void equip(id);
                    setPanel(null);
                  }}
                  onClose={() => setPanel(null)}
                />
              ) : null}
              {panel === "look" ? (
                <Appearance
                  key={pet.name}
                  pet={pet}
                  disabled={busy || !ready}
                  onSave={(...args) => void customize(...args)}
                />
              ) : null}
              {panel === "settings" ? (
                <>
                  <SizeSlider
                    id="pet-size"
                    label="Größe"
                    hint={`So viel Platz bekommt ${pet.name} auf deinem Desktop.`}
                    value={size}
                    min={PET_SIZE.min}
                    max={PET_SIZE.max}
                    step={PET_SIZE.step}
                    disabled={!ready}
                    onChange={changeSize}
                  />
                  <ToggleRow
                    label="Weniger Bewegung"
                    hint="Ruhiger Begleiter, gleiche Gesellschaft."
                    checked={pet.reducedMotion}
                    disabled={busy || !ready}
                    onChange={(checked) => void customize(pet.name, pet.color, checked, pet.size)}
                  />
                </>
              ) : null}
            </Panel>
          ) : null}

          <Dock label="Pet-Menü">
            <DockButton
              icon="spark"
              label="XP und Fortschritt"
              title={`${pet.name} · Level ${progress.level} · ${pet.xp} XP`}
              expanded={panel === "lan" || panel === "levelup"}
              onClick={() =>
                setPanel((current) => (current === "lan" || current === "levelup" ? null : "lan"))
              }
            />
            <DockButton
              icon="palette"
              label="Aussehen"
              title="Aussehen"
              expanded={panel === "look"}
              onClick={() => toggle("look")}
            />
            <DockButton
              icon="settings"
              label="Einstellungen"
              title="Einstellungen"
              expanded={panel === "settings"}
              onClick={() => toggle("settings")}
            />
          </Dock>
        </section>

        {error ? (
          <ErrorAlert message={error} onRetry={!ready ? () => void load() : undefined} />
        ) : null}
        {!ready && !error ? (
          <p className="loading" role="status">
            Spielstand wird geladen …
          </p>
        ) : null}
      </main>
      {!desktop ? (
        <footer className="preview-footer">
          <span className="status-dot" />
          Oberflächen-Vorschau · Starte <code>npm run tauri dev</code> für das Desktop-Pet.
        </footer>
      ) : null}
    </>
  );
}
