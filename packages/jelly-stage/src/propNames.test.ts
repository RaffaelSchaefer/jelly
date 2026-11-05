import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PROP_NAMES } from "./propNames.ts";

/** The server lists its props in Go. The stage must draw every one of them, and nothing else. */
const SERVER_PROPS = new URL("../../../apps/server/internal/rules/maps.go", import.meta.url);

test("the stage draws exactly the props the server lists", () => {
  const source = readFileSync(SERVER_PROPS, "utf8");
  const lists = source.match(/func list\w+Props\(\) \[\]string \{[^}]*\}/g) ?? [];
  const serverProps = lists.flatMap((list) =>
    [...list.matchAll(/"([\w-]+)"/g)].map((hit) => hit[1]),
  );
  assert.ok(serverProps.length > 0, "found no props in maps.go");
  assert.deepEqual([...PROP_NAMES].sort(), serverProps.sort());
});
