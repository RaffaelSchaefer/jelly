/**
 * The hall of a view: furniture, venue and stage platforms, built for the areas of the server on a
 * floor as large as the real hall. It is built again only when the areas or the size change.
 *
 * @module
 */

import type { Group, Scene } from "three";

import type { StageArea } from "./types.ts";
import type { RoomSize } from "./world.ts";

import { createFurniture } from "./furniture.ts";
import { disposeProps } from "./props.ts";
import { createVenue } from "./venue.ts";
import { DEFAULT_ROOM } from "./world.ts";
import { listPlatforms, type Placement } from "./zones.ts";

/** What stands in the hall and what it was built for. */
export interface Hall {
  /** Size of the room on the floor, from the meters of the server. */
  size: RoomSize;
  /** Areas and size as last built, to notice a change. */
  key: string;
  furniture: Group;
  venue: Group;
  /** The stage platforms, where the floor is raised. */
  platforms: Placement[];
}

/** Puts the empty lecture hall into a scene. */
export function createHall(scene: Scene): Hall {
  const hall: Hall = {
    size: DEFAULT_ROOM,
    key: "",
    furniture: createFurniture([], DEFAULT_ROOM),
    venue: createVenue([], DEFAULT_ROOM),
    platforms: [],
  };
  scene.add(hall.furniture, hall.venue);
  return hall;
}

/** Builds furniture, venue and platforms again when the areas or the size of the room changed. */
export function rebuildHall(hall: Hall, scene: Scene, areas: StageArea[], size: RoomSize): void {
  const key = JSON.stringify([size, areas]);
  if (key === hall.key) {
    return;
  }
  hall.key = key;
  hall.size = size;
  scene.remove(hall.furniture, hall.venue);
  disposeProps(hall.furniture);
  disposeProps(hall.venue);
  hall.furniture = createFurniture(areas, size);
  hall.venue = createVenue(areas, size);
  scene.add(hall.furniture, hall.venue);
  hall.platforms = listPlatforms(areas, size);
}
