# Cosmetics in Blender

Cosmetics are modelled in Blender around a copy of the pet and exported as `.glb` into
`src/cosmetics/<id>.glb`. The app picks them up at the next build or dev reload and draws them on
the pet when the cosmetic is equipped. Needs Blender 4.2 or newer.

## Set up once

```bash
blender --background --python blender/setup_cosmetics.py
```

This writes `blender/cosmetics.blend` with:

- **Referenz**: the pet (`body`, `head`, `hand_left`, `hand_right`) from `pet_reference.obj` and the
  frame **Sichtbereich**, which shows what the app's camera sees. None of it can be selected or is
  exported.
- **Cosmetics**: one collection per cosmetic from `src/pet.ts` (`headset`, `beanie`, `party-hat`,
  `pixel-glasses`, `hood`, `crown`, `golden-cup`). The collection name is the id.

Open the file. If Blender asks about running Python scripts, allow it once for this file: that
registers the **Cosmetics** tab in the 3D view's side bar (N).

## Model

1. Put your meshes into the cosmetic's collection, positioned on the reference pet as they should sit.
   Model in world space: the export keeps positions as they are, nothing is re-anchored.
2. Stay inside **Sichtbereich**. Anything above its top edge ends up behind the speech bubble.
3. One material per mesh. Only the **Base Color** of the Principled BSDF is used: the app shades every
   cosmetic like the pet (jelly gloss, light lower edge, outline in the pet's ink colour).
   Textures, roughness and transparency are ignored.
4. Use **Shade Smooth**. The outline is the mesh pushed out along its normals, so hard edges crack open.
5. Cosmetics are drawn on top of the head like a sticker. Parts that would be hidden behind the head
   (the back of a hood, the far ear cup) still show, so model only what is seen from the front.
6. Head and face cosmetics (slot `Kopf`, `Gesicht`) bob with the head. Cosmetics for the hands (slot
   `Hände`) sit between `hand_left` and `hand_right` of the reference pet, and `src/scene/HandHeld.tsx`
   moves them with the hands. The slot comes from `src/pet.ts`; the `slot` property on the collection
   is only a reminder.
7. Modifiers are fine (Mirror, Subdivision, Solidify): the export applies them.

## Export

**Cosmetics** tab → the export icon next to a cosmetic, or **Alle exportieren**. Empty collections are
skipped. Without opening Blender:

```bash
blender blender/cosmetics.blend --background --python blender/setup_cosmetics.py -- --export
```

Then commit `src/cosmetics/<id>.glb` (and `cosmetics.blend`, so others can carry on).

## A new cosmetic

1. Add it to `COSMETICS` in `src/pet.ts` (id, name, slot, icon, unlock).
2. Add a collection with that id under **Cosmetics** in Blender (or to `COSMETICS` in
   `setup_cosmetics.py` for fresh setups), model, export.

## When the pet changes

The reference is generated from `packages/jelly-scene/src/jellyGeometry.ts`. After changing the pet's shape:

```bash
pnpm run blender:reference
```

Then in Blender, delete the objects in **Referenz** and import `blender/pet_reference.obj` again
(File → Import → Wavefront, Forward −Z, Up Y), or set up a fresh file. Check that existing cosmetics
still fit.
