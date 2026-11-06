/**
 * What a jelly wears, by slot. A model takes a moment to load and the wish can change meanwhile, so
 * a late answer for an old wish must not end up on the jelly.
 *
 * @module
 */

/** One slot in use. `shown` stays empty while the model loads or if there is none. */
interface WornSlot<Item> {
  key: string;
  shown: Item | null;
}

/** What a jelly wears right now. Emptying it also turns away every answer still on its way. */
export type Worn<Item> = Map<string, WornSlot<Item>>;

/** How {@link syncWorn} gets a cosmetic onto a jelly and off it again. */
export interface WornActions<Model, Item> {
  /** Resolves to `null` for a key without a model. */
  load: (key: string) => Promise<Model | null>;
  put: (model: Model) => Item;
  remove: (item: Item) => void;
}

/** Brings `worn` in line with `wanted`, which holds a cosmetic key per slot. */
export function syncWorn<Model, Item>(
  worn: Worn<Item>,
  wanted: Map<string, string>,
  actions: WornActions<Model, Item>,
): void {
  for (const [slot, current] of worn) {
    if (wanted.get(slot) === current.key) continue;
    if (current.shown !== null) actions.remove(current.shown);
    worn.delete(slot);
  }
  for (const [slot, key] of wanted) {
    if (worn.has(slot)) continue;
    const entry: WornSlot<Item> = { key, shown: null };
    worn.set(slot, entry);
    actions
      .load(key)
      .then((model) => {
        if (model !== null && worn.get(slot) === entry) entry.shown = actions.put(model);
      })
      .catch((error: unknown) => {
        // The jelly stays without it, which is better than losing the whole stage.
        console.warn(`cosmetics: could not load ${key}`, error);
      });
  }
}
