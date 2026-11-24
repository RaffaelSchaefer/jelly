/**
 * The program of a LAN: points with time, title, detail and kind, which the app shows and reminds
 * of. The whole program is saved at once.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import { loadProgram, saveProgram, type ProgramItem } from "./apiEvents.ts";
import { createButton, createElement, createMessage, createSelect } from "./dom.ts";
import type { FailureHandler } from "./failure.ts";
import { readLocalDateTime, toLocalDateTimeValue } from "./format.ts";

const KIND_ORGA = "orga";
const TEXT_EMPTY = "Noch kein Programm. Füge den ersten Punkt hinzu.";

/** Names the kinds of points the server knows. */
function listProgramKinds(): [kind: string, text: string][] {
  return [
    [KIND_ORGA, "Orga"],
    ["food", "Essen"],
    ["yoga", "Yoga"],
    ["tournament", "Turnier"],
    ["together", "Gemeinsam"],
    ["news", "Jelly-News auf der Bühne"],
  ];
}

/** The inputs of one point, so the form can read them back. */
interface ProgramRow {
  root: HTMLElement;
  read(): ProgramItem;
}

/** Creates a labelled input inside a row. Rows repeat, so labels go in aria-label. */
function createRowInput(type: string, label: string, value: string): HTMLInputElement {
  const input = createElement("input", "");
  input.type = type;
  input.value = value;
  input.setAttribute("aria-label", label);
  input.placeholder = label;
  input.title = label;
  return input;
}

/** Creates the inputs of one point with a button that takes it out. */
function createProgramRow(item: ProgramItem, onRemove: (row: ProgramRow) => void): ProgramRow {
  const startsAt = createRowInput("datetime-local", "Beginn", toLocalDateTimeValue(item.starts_at));
  const endsAt = createRowInput(
    "datetime-local",
    "Ende (optional)",
    item.ends_at === null ? "" : toLocalDateTimeValue(item.ends_at),
  );
  const title = createRowInput("text", "Titel", item.title);
  const detail = createRowInput("text", "Detail (optional)", item.detail ?? "");
  const kind = createSelect("", listProgramKinds(), item.kind);
  kind.setAttribute("aria-label", "Art");
  const root = createElement("div", "program-row", startsAt, endsAt, kind, title, detail);
  const row: ProgramRow = {
    root,
    read: () => ({
      starts_at: readLocalDateTime(startsAt.value),
      ends_at: endsAt.value === "" ? null : readLocalDateTime(endsAt.value),
      title: title.value,
      detail: detail.value === "" ? null : detail.value,
      kind: kind.value,
    }),
  };
  root.append(createButton("Entfernen", "quiet", () => onRemove(row)));
  return row;
}

/** Proposes a new point one hour after the last one, or at the start of the LAN. */
function proposeItem(lan: LANSummary, rows: ProgramRow[]): ProgramItem {
  const last = rows.at(-1)?.read().starts_at;
  const hourMillis = 3_600_000;
  const startsAt = last === undefined || Number.isNaN(last) ? lan.starts_at : last + hourMillis;
  return { starts_at: startsAt, ends_at: null, title: "", detail: null, kind: KIND_ORGA };
}

/** Creates the panel and loads the program. */
export function createProgramPanel(lan: LANSummary, onFailure: FailureHandler): HTMLElement {
  const list = createElement(
    "div",
    "program-list",
    createElement("p", "hint", "Lade das Programm …"),
  );
  const message = createMessage();
  let rows: ProgramRow[] = [];
  const render = () => {
    list.replaceChildren(
      ...(rows.length === 0
        ? [createElement("p", "hint", TEXT_EMPTY)]
        : rows.map((row) => row.root)),
    );
  };
  const remove = (row: ProgramRow) => {
    rows = rows.filter((candidate) => candidate !== row);
    render();
  };
  const show = (items: ProgramItem[]) => {
    rows = items.map((item) => createProgramRow(item, remove));
    render();
  };
  loadProgram(lan.id)
    .then(show)
    .catch((error: unknown) => onFailure(error, message.showBad));
  const add = createButton("Punkt hinzufügen", "quiet", () => {
    rows.push(createProgramRow(proposeItem(lan, rows), remove));
    render();
  });
  const save = createButton("Programm speichern", "", () => {
    saveProgram(
      lan.id,
      rows.map((row) => row.read()),
    )
      .then((items) => {
        show(items);
        message.showGood("Programm gespeichert. Offene Apps laden es neu.");
      })
      .catch((error: unknown) => onFailure(error, message.showBad));
  });
  return createElement(
    "section",
    "panel",
    createElement("h3", "", "Programm"),
    createElement(
      "p",
      "hint",
      "Ohne Ende dauert ein Punkt bis zum nächsten. Die App erinnert zehn Minuten vorher. " +
        "Gespeichert wird nach Beginn sortiert.",
    ),
    list,
    message.root,
    createElement("div", "actions", add, save),
  );
}
