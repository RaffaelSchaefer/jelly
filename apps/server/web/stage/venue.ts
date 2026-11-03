/**
 * The front of the hall in 3D: the stage, the chillout lounge and the snack bar. None of them are
 * desks, each has a look of its own and some of their props move.
 *
 * @module
 */

import { Group, InstancedMesh, Mesh, type Material } from "three";

import type { StageArea } from "./types.ts";

import { createLounge } from "./lounge.ts";
import { isKeptMaterial, VENUE_TIME } from "./props.ts";
import { createSnackBar } from "./snackBar.ts";
import { createStage } from "./stageSet.ts";
import { toFloorRect } from "./world.ts";

/** Builds the stages, lounges and snack bars of the room. */
export function createVenue(areas: StageArea[]): Group {
  const venue = new Group();
  for (const area of areas) {
    const rect = toFloorRect(area);
    if (area.kind === "stage") venue.add(createStage(rect));
    if (area.kind === "lounge") venue.add(createLounge(rect));
    if (area.kind === "snackbar") venue.add(createSnackBar(rect));
  }
  return venue;
}

/** Moves the screens, lights, speakers and machines on. */
export function updateVenue(time: number): void {
  VENUE_TIME.value = time;
}

/** Frees what the venue holds. Materials shared by all props stay for the whole page. */
export function disposeVenue(venue: Group): void {
  venue.traverse((object) => {
    if (object instanceof InstancedMesh) object.dispose();
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const material = object.material as Material;
    if (!isKeptMaterial(material)) material.dispose();
  });
}
