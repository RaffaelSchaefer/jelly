import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { NEWS_PICTURES } from "./newsLines.ts";
import { NEWS_PICTURE_DATA } from "./newsPictureData.ts";
import { fitInside } from "./newsPictures.ts";

test("a picture fits whole into its square, whatever its shape", () => {
  const center = { x: 100, y: 50 };
  assert.deepEqual(fitInside({ width: 384, height: 384 }, center, 40), {
    x: 80,
    y: 30,
    width: 40,
    height: 40,
  });
  assert.deepEqual(fitInside({ width: 400, height: 200 }, center, 40), {
    x: 80,
    y: 40,
    width: 40,
    height: 20,
  });
});

test("every picture has its file, and the data module is up to date with them", () => {
  for (const key of NEWS_PICTURES) {
    assert.match(NEWS_PICTURE_DATA[key] ?? "", /^data:image\/webp;base64,/, `${key} is missing`);
  }
  const script = fileURLToPath(new URL("../scripts/pictures.mjs", import.meta.url));
  const check = spawnSync(process.execPath, [script, "--check"]);
  assert.equal(check.status, 0, "run `pnpm pictures`");
});
