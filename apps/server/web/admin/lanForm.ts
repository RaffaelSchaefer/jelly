/**
 * The form that creates a LAN.
 *
 * @module
 */

import { createLAN, type NewLAN } from "./api.ts";
import { createElement, createField, createMessage, type Field } from "./dom.ts";
import { isTimeZoneKnown, readLocalDateTime, suggestSlug } from "./format.ts";

const TEXT_FILL_TIMES = "Bitte gib Beginn und Ende an.";
const TEXT_END_AFTER_START = "Das Ende muss nach dem Beginn liegen.";
const TEXT_UNKNOWN_TIME_ZONE = "Diese Zeitzone gibt es nicht. Beispiel: Europe/Berlin";

/** What the form needs from the work area. */
export interface LANFormActions {
  onCreated(slug: string): void;
  onFailure(error: unknown, showMessage: (text: string) => void): void;
}

/** The inputs of the form. */
interface LANFormFields {
  name: Field;
  slug: Field;
  joinCode: Field;
  startsAt: Field;
  endsAt: Field;
  timezone: Field;
}

/** Creates all inputs with the help the organizers need. */
function createFields(): LANFormFields {
  const fields: LANFormFields = {
    name: createField({ id: "lan-name", label: "Name" }),
    slug: createField({
      id: "lan-slug",
      label: "Kurzname",
      hint: "Bleibt dauerhaft gleich. Wird aus dem Namen vorgeschlagen.",
    }),
    joinCode: createField({
      id: "lan-join-code",
      label: "LAN-Code",
      hint: "Damit treten Spieler bei. Du findest ihn später bei der LAN.",
    }),
    startsAt: createField({ id: "lan-starts", label: "Beginn", type: "datetime-local" }),
    endsAt: createField({ id: "lan-ends", label: "Ende", type: "datetime-local" }),
    timezone: createField({
      id: "lan-timezone",
      label: "Zeitzone",
      hint: "Beginn und Ende gelten in der Zeitzone dieses Browsers.",
    }),
  };
  fields.timezone.input.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const field of Object.values(fields)) {
    field.input.required = true;
  }
  return fields;
}

/** Suggests the short name until someone types their own. */
function linkSlugToName(fields: LANFormFields): void {
  let isSlugTyped = false;
  fields.slug.input.addEventListener("input", () => {
    isSlugTyped = true;
  });
  fields.name.input.addEventListener("input", () => {
    if (!isSlugTyped) {
      fields.slug.input.value = suggestSlug(fields.name.input.value);
    }
  });
}

/** Reads the form into the shape of the API. */
function readNewLAN(fields: LANFormFields): NewLAN {
  return {
    slug: fields.slug.input.value.trim(),
    name: fields.name.input.value.trim(),
    timezone: fields.timezone.input.value.trim(),
    join_code: fields.joinCode.input.value.trim(),
    starts_at: readLocalDateTime(fields.startsAt.input.value),
    ends_at: readLocalDateTime(fields.endsAt.input.value),
  };
}

/** Creates the panel with the form. */
export function createLANForm(actions: LANFormActions): HTMLElement {
  const fields = createFields();
  linkSlugToName(fields);
  const message = createMessage();
  const submit = createElement("button", "", "LAN anlegen");
  const form = createElement(
    "form",
    "panel",
    createElement("h2", "", "Neue LAN"),
    createElement(
      "div",
      "fields",
      fields.name.root,
      fields.slug.root,
      fields.joinCode.root,
      createElement("div", "field-pair", fields.startsAt.root, fields.endsAt.root),
      fields.timezone.root,
    ),
    message.root,
    createElement("div", "actions", submit),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const lan = readNewLAN(fields);
    if (Number.isNaN(lan.starts_at) || Number.isNaN(lan.ends_at)) {
      message.showBad(TEXT_FILL_TIMES);
      return;
    }
    if (lan.starts_at >= lan.ends_at) {
      message.showBad(TEXT_END_AFTER_START);
      return;
    }
    if (!isTimeZoneKnown(lan.timezone)) {
      message.showBad(TEXT_UNKNOWN_TIME_ZONE);
      return;
    }
    submit.disabled = true;
    createLAN(lan)
      .then(() => actions.onCreated(lan.slug))
      .catch((error: unknown) => {
        submit.disabled = false;
        actions.onFailure(error, message.showBad);
      });
  });
  return form;
}
