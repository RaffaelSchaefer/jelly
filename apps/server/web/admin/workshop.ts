/**
 * The workshop: what only testing needs, the bots and short times, and the whole log.
 *
 * @module
 */

import { createActionLogSection } from "./actionLog.ts";
import { createBotsTab } from "./bots.ts";
import { createElement } from "./dom.ts";
import type { SectionContext } from "./lanContext.ts";
import { createTestRulesPanel } from "./testRules.ts";

/** Creates the section. */
export function createWorkshop(context: SectionContext): HTMLElement {
  return createElement(
    "div",
    "detail",
    createElement(
      "p",
      "banner",
      "Nur zum Testen. Bots und Testzeiten wirken auf die echte Bühne und die echte LAN.",
    ),
    createTestRulesPanel(context.lan, context),
    createBotsTab(context.lan, context.onFailure),
    createActionLogSection(context.onFailure),
  );
}
