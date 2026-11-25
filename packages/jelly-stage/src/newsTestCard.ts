/**
 * The test card of the stage screens at run time: it decodes once in the background, the first time
 * the screens ask for it, never on import, and becomes a texture that is uploaded once. Until it is
 * there the screens play their equalizer, so they never stand blank or black.
 *
 * @module
 */

import { SRGBColorSpace, Texture } from "three";

import { NEWS_TEST_CARD_DATA } from "./newsTestCardData.ts";

/** The screens are seen at a slant from the studio shots: sharper there. */
const ANISOTROPY = 8;

/** The card once it was asked for, and whether it is decoded. */
const CARD: { texture: Texture | null; isDecoded: boolean } = { texture: null, isDecoded: false };

/** Starts decoding the card, once. Outside a browser, as in the tests, there is nothing to decode. */
function startCard(): void {
  if (CARD.texture || !NEWS_TEST_CARD_DATA || typeof Image === "undefined") return;
  const image = new Image();
  const texture = new Texture(image);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = ANISOTROPY;
  CARD.texture = texture;
  image.src = NEWS_TEST_CARD_DATA;
  image
    .decode()
    .then(() => {
      texture.needsUpdate = true;
      CARD.isDecoded = true;
    })
    .catch(() => {
      CARD.texture = null;
    });
}

/** Returns the texture of the test card once it is decoded, null before that or without a file. */
export function findTestCard(): Texture | null {
  startCard();
  return CARD.isDecoded ? CARD.texture : null;
}
