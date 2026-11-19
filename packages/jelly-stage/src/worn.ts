/**
 * What a jelly wears, by slot. A model takes a moment to load and the wish can change meanwhile, so
 * a late answer for an old wish must not end up on the jelly.
 *
 * @module
 */

/** One cosmetic as the player wants it: its key and, for colorable ones, the chosen color. */
export interface WornWish {
  key: string;
  color: string | null;
}

/** One slot in use. `shown` stays empty while the model loads or if there is none. */
interface WornSlot<Item> {
  wish: WornWish;
  shown: Item | null;
}

/** What a jelly wears right now. Emptying it also turns away every answer still on its way. */
export type Worn<Item> = Map<string, WornSlot<Item>>;

/** How {@link syncWorn} gets a cosmetic onto a jelly and off it again. */
export interface WornActions<Model, Item> {
  /** Resolves to `null` for a key without a model. */
  load: (key: string) => Promise<Model | null>;
  put: (model: Model, wish: WornWish) => Item;
  remove: (item: Item) => void;
}

/** Brings `worn` in line with `wanted`. A new color counts as a new wish. */
export function syncWorn<Model, Item>(
  worn: Worn<Item>,
  wanted: Map<string, WornWish>,
  actions: WornActions<Model, Item>,
): void {
  for (const [slot, current] of worn) {
    const wish = wanted.get(slot);
    if (wish?.key === current.wish.key && wish.color === current.wish.color) continue;
    if (current.shown !== null) actions.remove(current.shown);
    worn.delete(slot);
  }
  for (const [slot, wish] of wanted) {
    if (worn.has(slot)) continue;
    const entry: WornSlot<Item> = { wish, shown: null };
    worn.set(slot, entry);
    actions
      .load(wish.key)
      .then((model) => {
        if (model !== null && worn.get(slot) === entry) entry.shown = actions.put(model, wish);
      })
      .catch((error: unknown) => {
        // The jelly stays without it, which is better than losing the whole stage.
        console.warn(`cosmetics: could not load ${wish.key}`, error);
      });
  }
}
