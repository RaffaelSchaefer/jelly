/**
 * The repeat of one point of the program: every few minutes until a last start. The server writes
 * out every single time for the apps, the page only keeps the rule.
 *
 * @module
 */

import type { ProgramRepeat } from "./apiEvents.ts";
import { readLocalDateTime, toLocalDateTimeValue } from "./format.ts";

/** The inputs of a repeat and how to read them back. */
export interface RepeatInputs {
  every: HTMLInputElement;
  until: HTMLInputElement;
  /** Gives nothing while both fields are empty, so the point takes place once. */
  read(): ProgramRepeat | undefined;
}

/** Creates the inputs of a repeat. `createInput` gives them the look of the other fields. */
export function createRepeatInputs(
  repeat: ProgramRepeat | undefined,
  createInput: (type: string, label: string, value: string) => HTMLInputElement,
): RepeatInputs {
  const every = createInput(
    "number",
    "Wiederholen alle … Minuten (optional)",
    repeat === undefined ? "" : String(repeat.every_minutes),
  );
  every.min = "5";
  every.step = "5";
  const until = createInput(
    "datetime-local",
    "Wiederholen bis",
    repeat === undefined ? "" : toLocalDateTimeValue(repeat.until),
  );
  return {
    every,
    until,
    read: () =>
      every.value === "" && until.value === ""
        ? undefined
        : { every_minutes: Number(every.value), until: readLocalDateTime(until.value) },
  };
}
