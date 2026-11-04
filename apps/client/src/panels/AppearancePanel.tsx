/**
 * Panel „Aussehen“: Name und Farbe des Pets.
 *
 * @module
 */

import { useState, type FormEvent } from "react";

import { desktop } from "../backend";
import { appearanceOf, type Appearance, type Pet } from "../pet";
import { ColorChoice, PrimaryButton, TextField } from "../ui";

/**
 * Formular für Name und Farbe. Übernommen wird erst beim Absenden. Bewegung und Größe bleiben, wie
 * sie sind (die stehen in den Einstellungen).
 */
export default function AppearancePanel({
  pet,
  disabled,
  onSave,
}: {
  pet: Pet;
  disabled: boolean;
  onSave: (appearance: Appearance) => void;
}) {
  const [name, setName] = useState(pet.name);
  const [color, setColor] = useState(pet.color);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ ...appearanceOf(pet), name, color });
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
