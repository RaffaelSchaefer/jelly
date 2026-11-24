# Cosmetics in Blender

Cosmetics are modelled in Blender around a copy of the pet and exported as `.glb` into
`packages/jelly-scene/src/cosmetics/<id>.glb`. The app, the map and the stage draw them on the pet
when the cosmetic is equipped. Needs Blender 4.2 or newer.

## Set up once

```bash
blender --background --python blender/setup_cosmetics.py
```

This writes `blender/cosmetics.blend` with:

- **Referenz**: the pet (`body`, `head`, `hand_left`, `hand_right`) from `pet_reference.obj` and the
  frame **Sichtbereich**, which shows what the app's camera sees. None of it can be selected or is
  exported.
- **Cosmetics**: one collection per cosmetic from `src/pet.ts` (`headset`, `headset-neutral`, `beanie`, `party-hat`,
  `pixel-glasses`, `hood`, `crown`, `golden-cup`, `sprout`, `schnoerbi-mask`, `long-schnoerbi`, `goose`, `bandana`,
  `bell-collar`, `knit-scarf`, `snail-shell`, `mini-backpack`, `fairy-wings`, `bat-wings`, `chicken`, `piercings`, `ogre-ears`,
  `kamina-glasses`, `cat-ears`, `cyber-cat-ears`, `cat-whiskers`, `kitten`, `yarn-ball`, `cat-paws`, `cat-tail`,
  `nasal-helmet`, `kite-shield`, `octopus`, `hollow-helmet`, `nail-sword`, `bfg`). The collection name is the id.

Open the file. If Blender asks about running Python scripts, allow it once for this file: that
registers the **Cosmetics** tab in the 3D view's side bar (N).

## Model

1. Put your meshes into the cosmetic's collection, positioned on the reference pet as they should sit.
   Model in world space: the export keeps positions as they are, nothing is re-anchored.
2. Stay inside **Sichtbereich**. Anything above its top edge ends up behind the speech bubble. A
   cosmetic with `pulse` or `wave` in `COSMETIC_LOOKS` (cosmetic.ts), like the octopus, stretches,
   rocks and sways while the pet moves: leave it room, `cosmeticLooks.test.ts` checks every pose.
3. One material per mesh. Only the **Base Color** of the Principled BSDF is used: the app shades every
   cosmetic like the pet (jelly gloss, light lower edge, outline in the pet's ink colour).
   Textures, roughness and transparency are ignored. A custom property `glow` (0–1) on the material
   dampens the light lower edge: dark colours turn grey there otherwise (the wizard's hat uses 0.15).
   A custom property `fluff` (0–1) makes it plush: no jelly gloss, fur grain and a light, fuzzy rim
   (the long Schnörbi's fur uses 1). A custom property `tint` makes it take the colour the wearer picks
   instead of its own: 1 is that colour, below 1 a darker shade (colour × tint), above 1 a lighter
   one (towards white by tint − 1). A negative `tint` does the same with the colour opposite to the
   picked one, half a turn round the colour wheel (the octopus's iris uses −1). Without it the
   material keeps its Base Color (the hood's green uses 1, its hem 0.58). A custom property `glass` (0–1) makes it see-through from the front, more
   the higher it is, while its rim covers more (the Kamina glasses' lens uses 0.35). The app then
   draws the whole cosmetic last in its paint layer and its outline after the fill, so ink only
   shows outside: a part in front of glass must be an open sheet facing the front, without back or
   edge, or its outline inks a line round it (the glasses' glints). A custom property `neon` (0–1)
   makes it shine by itself: no shading and no gloss, its colour stays as bright and saturated as
   modelled, even where a scene dims its light (the cyber cat ears' panel and the BFG's plasma use 1). A darker shade
   of the same colour round it, also neon, reads as its glow.
4. Use **Shade Smooth**. The outline is the mesh pushed out along its normals, so hard edges crack open.
5. Cosmetics are drawn on top of the head like a sticker. Parts that would be hidden behind the head
   (the back of a hood, the far ear cup) still show, so model only what is seen from the front. A
   cosmetic with `behind` in `COSMETIC_LOOKS` (cosmetic.ts) is drawn behind the pet instead, so the
   pet and its ink edge cover it: the cat ears grow out from behind the head that way. Near the
   head's outline such a part stays behind z 0.2, where that ink lies, or it shows in front of it.
   The BFG uses it to sit in real depth: it points at the camera, the left hand shows in front of
   its grip and its far end vanishes in the pet. `build_bfg.py` meshes every part in the gun's own
   frame and turns it into place, and checks through the app's camera that nothing covers the
   left hand or the face and nothing leaves the pet window.
6. Head and face cosmetics (slot `Kopf`, `Gesicht`) bob with the head. Cosmetics for the hands (slot
   `Hände`) sit between `hand_left` and `hand_right` of the reference pet, and `src/scene/HandHeld.tsx`
   moves them with the hands. What the pet wears on its hands instead (the cat paws on each, the
   kite shield and the nail sword on the left one: `ON_HANDS` in `packages/jelly-scene/src/held.ts`)
   is one hand's part round the origin: the app draws it on those hands, so it stays on while the
   pet waves. It keeps its angle while the hand moves; the sword leaves its grip out where the fist
   closes, so the hand shows there. Body cosmetics (slot `Körper`) stay with the body while the head
   bobs above them: neckwear sits just below the seam, and parts behind the pet (wings, backpack,
   shell) exist only outside its silhouette, tucked under the body's edge, not the head's. The cat
   tail is drawn behind the pet instead (`behind`, see 5.) and needs no such cut: body and hands
   cover it. Held cosmetics paint one layer above them. The slot comes from `src/pet.ts`; the `slot` property on the
   collection is only a reminder.
7. Modifiers are fine (Mirror, Subdivision, Solidify): the export applies them. For implicit
   surfaces `generator.add_implicit` meshes, thins and shades them by the surface's own normals and
   mirrors them itself; `shapes.problems` checks the face's windows, the frame and the hands, and
   `shapes.fur` pushes tufts of fur out of a mesh where its outline is.
8. Plush parts that flow into each other without a crease can be one implicit surface in a generator:
   signed distances from `shapes.py`, joined by `smooth_union` and meshed by `surface_nets`, with a
   Decimate modifier to stay in budget. `sdf_decal` lays eyes, cheeks or patches onto it. See
   `build_goose.py`.

## Export

**Cosmetics** tab → the export icon next to a cosmetic, or **Alle exportieren**. Empty collections are
skipped. Without opening Blender:

```bash
blender blender/cosmetics.blend --background --python blender/setup_cosmetics.py -- --export
```

Then commit `packages/jelly-scene/src/cosmetics/<id>.glb` (and `cosmetics.blend`, so others can carry
on).

## A new cosmetic

1. Add it to `COSMETICS` in `src/pet.ts` (id, name, slot, icon, unlock).
2. Add a collection with that id under **Cosmetics** in Blender (or to `COSMETICS` in
   `setup_cosmetics.py` for fresh setups), model, export.
3. Add an import line and an entry to `COSMETIC_MODELS` in `packages/jelly-scene/src/cosmetic.ts`.
   Without it nothing shows it, and only then does its test run.

## The shopkeeper

Funkelbart, the wizard in the app's shop, wears his own parts: hat, hair, beard, brows, mustache,
nose, robe, a crystal-ball stand and a wand. `build_wizard.py` generates all of them in Python into
one collection `wizard` (slot NPC); the shape helpers it shares live in `shapes.py`, the layered
preview in `preview.py`. Change the numbers in `build_wizard.py` and run

```bash
blender blender/cosmetics.blend --background --python blender/build_wizard.py -- --save --export
```

Every run rebuilds the collection from the numbers and removes the v1 collections (`wizard-hat`,
`wizard-face`, `wizard-orb`). Without `--save` the `.blend` on disk stays as it was. The flags can be
combined:

| Flag                | What it does                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--save`            | Stores the collection in `cosmetics.blend`, with `build_wizard.py`, `shapes.py` and `preview.py` as text blocks.                                                                                                                         |
| `--export`          | Writes only `packages/jelly-scene/src/cosmetics/wizard.glb` (with `export_extras`) and deletes the v1 files `wizard-hat.glb`, `wizard-face.glb` and `wizard-orb.glb`.                                                                    |
| `--check`           | Prints a JSON report after the marker `CHECK`: vertices and bytes of the GLB as the app loads it (exported to a temporary folder unless `--export` ran), the budget, per-part bounds and any problems. Exits 1 when a rule below breaks. |
| `--preview out.png` | Renders the shop camera (1440×600, Workbench with object outline) into `out.png`. Never saves the `.blend`.                                                                                                                              |

The parts are not in `COSMETICS` or `COSMETIC_MODELS`: the shop loads them through `@jelly/scene/wizard`
(`packages/jelly-scene/src/wizard.ts`), so neither the catalog, the map nor the stage shows them.
`loadWizardPart(part)` splits the one file by the custom property `part` that every object carries.
`WIZARD_PARTS` in `wizard.ts` mirrors `PARTS` in `build_wizard.py`: keep both in step.

| Part        | Anchor | Paint layer | Outline | Notes                                                          |
| ----------- | ------ | ----------- | ------- | -------------------------------------------------------------- |
| `hat`       | head   | 0           | 0.035   | cone, brim, hem, embroidery, patch                             |
| `hair`      | head   | 0           | 0.03    | under the brim                                                 |
| `hatTrim`   | head   | 1           | 0.022   | wine band, brass clasp, tip star                               |
| `locks`     | head   | 1           | 0.026   | locks under the beard, brass bead                              |
| `beard`     | head   | 2           | 0.03    | the cushion                                                    |
| `brow`      | head   | 2           | 0.026   | right half only, the shop mirrors it (pivot 0.22, 0.77, 0.74)  |
| `mustache`  | head   | 3           | 0.02    | right half only, the shop mirrors it (pivot 0.04, 0.556, 0.79) |
| `nose`      | head   | 4           | 0.02    |                                                                |
| `robe`      | body   | 0           | 0.035   | cape, gold piping, collar                                      |
| `clasps`    | body   | 1           | 0.02    |                                                                |
| `orbStand`  | orb    | 0           | 0.03    | foot, stem, cup, side talons                                   |
| `orbSparks` | orb    | 0           | 0.016   |                                                                |
| `orbClaws`  | orb    | 2           | 0.02    | the front talons that grip the ball                            |
| `wand`      | hand   | 2           | 0.022   | shown only while he points                                     |

Rules for the model:

- One material per object. A material's custom property `glow` sets how much it lights up from below
  (see the swatch in `build_wizard.py`).
- Head parts sit on the reference pet, body parts too (they hang in the jelly's root and sway with
  it). The orb parts are modelled around the ball's rest centre: the foot's bottom at y −0.32 stands
  on the counter, and there is no ball mesh, a shader draws it (`crystal.ts`). The wand is modelled
  in the frame of the right hand (fingers +y, palm +z).
- A higher paint layer covers lower ones completely, with its own ink rim, like a sticker on a
  sticker. Parts in the same layer still hide each other by depth.
- Stickers paint over the raymarched hands. A hand only shows where no part covers it: beside the
  body (|x| ≥ 1.05, −0.2 ≤ y ≤ 1.3) or at the robe's edge (0.72 ≤ |x| ≤ 1.05, 0.25 ≤ y ≤ 0.72).
  Keep the robe and the beard inside these limits, or the wizard's gestures vanish behind them.
- In the shop, candles, orb, moon and rune circle light every part (`sceneLight.ts` in the package).
  The light brightens a material's own colour and adds nothing on top, so the swatch is what the
  part looks like in the dim room: the midnight hat stays dark, the wine robe stays red. Pick the
  colours here, not with light in the app.

`--check` (and `wizard.test.ts`) enforce:

- at most 10,500 vertices and 380,000 bytes, and exactly the 14 part names above;
- no vertex of `hair`, `locks`, `beard`, `brow`, `mustache` or `nose` in the mouth window
  (|x| < 0.12, 0.345 < y < 0.52) or the lidded eyes (0.11 < |x| < 0.27, 0.58 < y < 0.69); |x| also
  covers the mirrored halves.

`wizard.test.ts` also keeps the hat below y 2.1 with its outline and within |x| ≤ 1.02, the brim
above y 0.85 in front, beard and locks above y −0.27 (the counter), the robe within y ≤ 0.17 and
|x| ≤ 0.95, the orb parts within 0.34 of the ball and the wand within |x| ≤ 0.09, y −0.13 to 0.67.

The preview places the parts as the shop does: the camera at wizard-local (2.3, 0.62, 9.4) looking
along −z with a vertical field of view of 24°, the orb at its rest spot (1.68, 0, 0.75) and the wand
in the hand of the pointing pose. Stand-ins show what the app draws itself: the lidded eyes, the
mouth, the crystal ball and a brown counter (top at y −0.32 from z 0.55 to 1.08, its front below,
right end at x 2.35). It stacks one pass per layer like the app paints: pet, layer 0 to 4, counter.

## When the pet changes

The reference is generated from `packages/jelly-scene/src/jellyGeometry.ts`. After changing the pet's shape:

```bash
pnpm run blender:reference
```

Then in Blender, delete the objects in **Referenz** and import `blender/pet_reference.obj` again
(File → Import → Wavefront, Forward −Z, Up Y), or set up a fresh file. Check that existing cosmetics
still fit.
