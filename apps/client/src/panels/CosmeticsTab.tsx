/**
 * XP-Reiter „Cosmetics“: Raster aller Teile, Filter nach Platz und Detailansicht zum Anlegen.
 *
 * @module
 */

import { useState } from "react";

import { COSMETICS, isUnlocked, levelProgress, unlockLabel, type Cosmetic, type Pet } from "../pet";
import { CosmeticTile, Icon, PrimaryButton } from "../ui";

/** Filter über dem Raster. */
const SLOTS = ["Alle", "Kopf", "Gesicht", "Effekte"] as const;

/** Zustand einer Kachel für `pet`. */
function tileState(item: Cosmetic, pet: Pet) {
  if (pet.cosmetic === item.id) return "equipped";
  return isUnlocked(item, pet) ? "unlocked" : "locked";
}

/** Text unter dem Kachelnamen je Zustand. */
function tileNote(item: Cosmetic, state: ReturnType<typeof tileState>) {
  if (state === "equipped") return "Angelegt";
  if (state === "unlocked") return "Freigeschaltet";
  return unlockLabel(item);
}

/** Das ausgewählte Teil mit Freischalt-Hinweis und Knopf zum An- oder Ablegen. */
function CosmeticDetail({
  item,
  pet,
  disabled,
  onEquip,
}: {
  item: Cosmetic;
  pet: Pet;
  disabled: boolean;
  onEquip: (id: string | null) => void;
}) {
  const unlocked = isUnlocked(item, pet);
  const worn = pet.cosmetic === item.id;
  return (
    <div className="cosmetic-detail">
      <span className="cosmetic-preview">
        <Icon name={item.icon} />
      </span>
      <span>
        <strong>{item.name}</strong>
        <small>{`${unlocked ? "Freigeschaltet" : "Gesperrt"} · ${unlockLabel(item)}.`}</small>
      </span>
      {unlocked ? (
        <PrimaryButton disabled={disabled} onClick={() => onEquip(worn ? null : item.id)}>
          {worn ? "Ablegen" : "Anlegen"}
        </PrimaryButton>
      ) : null}
    </div>
  );
}

/** Der Reiter „Cosmetics“. Vorausgewählt ist das angelegte oder das erste freigeschaltete Teil. */
export default function CosmeticsTab({
  pet,
  disabled,
  onEquip,
}: {
  pet: Pet;
  disabled: boolean;
  /** Bekommt die ID zum Anlegen oder `null` zum Ablegen. */
  onEquip: (id: string | null) => void;
}) {
  const [slot, setSlot] = useState<(typeof SLOTS)[number]>("Alle");
  const [selectedId, setSelectedId] = useState(
    pet.cosmetic ?? COSMETICS.find((item) => isUnlocked(item, pet))?.id ?? COSMETICS[0].id,
  );
  const selected = COSMETICS.find((item) => item.id === selectedId) ?? COSMETICS[0];
  const unlocked = COSMETICS.filter((item) => isUnlocked(item, pet)).length;
  return (
    <div className="xp-sections">
      <div className="xp-section-head">
        <strong>
          {unlocked} von {COSMETICS.length} freigeschaltet
        </strong>
        <span>
          Level {levelProgress(pet.xp).level} · {pet.xp} XP
        </span>
      </div>
      <div className="chips" role="group" aria-label="Kategorie">
        {SLOTS.map((item) => (
          <button key={item} aria-pressed={slot === item} onClick={() => setSlot(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="cosmetic-grid">
        {COSMETICS.filter((item) => slot === "Alle" || item.slot === slot).map((item) => {
          const state = tileState(item, pet);
          return (
            <CosmeticTile
              key={item.id}
              icon={item.icon}
              name={item.name}
              state={state}
              note={tileNote(item, state)}
              selected={item.id === selected.id}
              onClick={() => setSelectedId(item.id)}
            />
          );
        })}
      </div>
      <CosmeticDetail item={selected} pet={pet} disabled={disabled} onEquip={onEquip} />
      <p className="panel-hint">Neue Teile gibt’s mit jedem Level, für Erfolge und bei Events.</p>
    </div>
  );
}
