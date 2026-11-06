/**
 * Small helpers to build the page. Text always goes in as text, so player input stays harmless.
 *
 * @module
 */

/** A child of an element. Empty values are left out, which keeps optional parts short to write. */
export type Child = Node | string | null | undefined;

/** Creates an element with a class and children. */
export function createElement<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  ...children: Child[]
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  if (className !== "") {
    element.className = className;
  }
  element.append(...children.filter((child) => child !== null && child !== undefined));
  return element;
}

/** Describes one labelled input. */
export interface FieldOptions {
  id: string;
  label: string;
  type?: string;
  hint?: string;
}

/** A labelled input with its parts, so that callers can read and change them. */
export interface Field {
  root: HTMLElement;
  input: HTMLInputElement;
  hint: HTMLElement;
}

/** Creates a label, an input and a line of help below them. */
export function createField(options: FieldOptions): Field {
  const label = createElement("label", "", options.label);
  label.htmlFor = options.id;
  const input = createElement("input", "");
  input.id = options.id;
  input.type = options.type ?? "text";
  const hint = createElement("p", "hint", options.hint);
  hint.hidden = options.hint === undefined;
  return { root: createElement("div", "field", label, input, hint), input, hint };
}

/** Creates a button that does not submit a form. */
export function createButton(text: string, className: string, onClick: () => void) {
  const button = createElement("button", className, text);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

/** A line that reports the result of an action. */
export interface Message {
  root: HTMLElement;
  showGood(text: string): void;
  showBad(text: string): void;
  clear(): void;
}

/** Creates an empty message line that screen readers announce. */
export function createMessage(): Message {
  const root = createElement("p", "message");
  root.setAttribute("role", "status");
  root.hidden = true;
  const show = (text: string, className: string) => {
    root.className = `message ${className}`;
    root.textContent = text;
    root.hidden = false;
  };
  return {
    root,
    showGood: (text) => show(text, "message-good"),
    showBad: (text) => show(text, "message-bad"),
    clear: () => {
      root.hidden = true;
    },
  };
}

const CONFIRM_MILLIS = 5000;

/**
 * Creates a button that asks for a second click before it acts. The page has no dialogs, so the
 * button itself says what will happen and turns back after a few seconds.
 */
export function createConfirmButton(text: string, confirmText: string, onConfirm: () => void) {
  const button = createElement("button", "quiet", text);
  button.type = "button";
  let timer = 0;
  const reset = () => {
    window.clearTimeout(timer);
    timer = 0;
    button.textContent = text;
    button.classList.remove("is-armed");
  };
  button.addEventListener("click", () => {
    if (timer === 0) {
      button.textContent = confirmText;
      button.classList.add("is-armed");
      timer = window.setTimeout(reset, CONFIRM_MILLIS);
      return;
    }
    reset();
    onConfirm();
  });
  return button;
}

/** Creates a table that scrolls sideways on its own when it is wider than the screen. */
export function createTable(headers: string[], rows: Child[][]): HTMLElement {
  const head = createElement("tr", "", ...headers.map((header) => createElement("th", "", header)));
  const body = rows.map((cells) =>
    createElement("tr", "", ...cells.map((cell) => createElement("td", "", cell))),
  );
  return createElement(
    "div",
    "table-wrap",
    createElement(
      "table",
      "",
      createElement("thead", "", head),
      createElement("tbody", "", ...body),
    ),
  );
}

/** Creates a dropdown. The first option is selected unless `selected` names another. */
export function createSelect(
  id: string,
  options: [value: string, text: string][],
  selected?: string,
): HTMLSelectElement {
  const select = createElement("select", "");
  select.id = id;
  for (const [value, text] of options) {
    const option = createElement("option", "", text);
    option.value = value;
    option.selected = value === selected;
    select.append(option);
  }
  return select;
}

/** Creates a label above a control that is not a text input. */
export function createLabelled(id: string, label: string, control: HTMLElement): HTMLElement {
  const caption = createElement("label", "", label);
  caption.htmlFor = id;
  return createElement("div", "field", caption, control);
}
