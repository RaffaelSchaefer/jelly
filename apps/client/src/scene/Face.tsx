/**
 * Das Gesicht des Pets: zwei Augen mit Glanzpunkten, Wangen und ein Mund.
 *
 * Die Teile sitzen auf der Kopfoberfläche und schauen entlang ihrer Normale nach außen. Die
 * Animation (`animation.ts`) bewegt sie über die Refs in {@link FaceRefs}.
 *
 * @module
 */

import type { RefObject } from "react";
import type { Group, Mesh, Object3D } from "three";

import { PET_COLORS, type PetColor } from "../pet";
import { HEAD, headSurface } from "./jellyGeometry";

/** Linke und rechte Seite als Vorzeichen. Index 0 ist links. */
const SIDES = [-1, 1] as const;

/** Augenposition relativ zur Kopfmitte. `x` gilt gespiegelt für beide Seiten. */
const EYE = { x: 0.19, y: 0.0 } as const;

/** Render-Order des Gesichts: nach dem Jelly, vor den Cosmetics. */
const FACE_ORDER = 6;

/** Refs, über die die Animation blinzelt, strahlt und errötet. */
export interface FaceRefs {
  eyes: RefObject<(Group | null)[]>;
  mouth: RefObject<Mesh | null>;
  cheeks: RefObject<(Mesh | null)[]>;
}

/** Stelle auf dem Kopf relativ zur Kopfmitte. */
interface HeadSpot {
  x: number;
  y: number;
  /** Wie weit das Teil in den Kopf eingelassen ist. Negativ hebt es an. */
  inset: number;
  /** Drehung um die eigene Blickachse im Bogenmaß. */
  roll?: number;
}

/** Setzt `object` auf die Kopfoberfläche und richtet es entlang der Flächennormale aus. */
function placeOnHead(object: Object3D, { x, y, inset, roll = 0 }: HeadSpot) {
  const [px, py, pz] = headSurface(x, y, inset);
  object.position.set(px, py, pz);
  // Normale des Ellipsoids: Gradient von (x/r)² + (y/r)² + (z/(r·depth))².
  const r2 = HEAD.radius * HEAD.radius;
  const nx = x / r2;
  const ny = y / r2;
  const nz = (pz + inset - HEAD.z) / (r2 * HEAD.depth * HEAD.depth);
  object.rotation.set(-Math.atan2(ny, Math.hypot(nx, nz)), Math.atan2(nx, nz), roll, "YXZ");
}

/** Ein Auge: dunkle Pupille mit großem und kleinem Glanzpunkt. */
function Eye({ ink, register }: { ink: string; register: (node: Group | null) => void }) {
  return (
    <group ref={register}>
      <mesh renderOrder={FACE_ORDER} scale={[0.058, 0.084, 0.022]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color={ink} />
      </mesh>
      <mesh
        renderOrder={FACE_ORDER}
        position={[-0.016, 0.028, 0.021]}
        scale={[0.018, 0.023, 0.008]}
      >
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#f3ffff" />
      </mesh>
      <mesh renderOrder={FACE_ORDER} position={[0.015, -0.026, 0.022]} scale={[0.008, 0.01, 0.005]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#8fdcff" />
      </mesh>
    </group>
  );
}

/** Eine Wange. Startet unsichtbar, die Animation blendet sie beim Stupsen ein. */
function Cheek({ register }: { register: (node: Mesh | null) => void }) {
  return (
    <mesh ref={register} scale={[0.075, 0.045, 1]} renderOrder={FACE_ORDER + 1}>
      <circleGeometry args={[1, 24]} />
      <meshBasicMaterial color="#ff5c9a" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** Das ganze Gesicht in Tintenfarbe der Farbvariante `color`. */
export default function Face({ color, eyes, mouth, cheeks }: FaceRefs & { color: PetColor }) {
  const ink = PET_COLORS[color].ink;
  return (
    <group>
      {SIDES.map((side, index) => (
        <Eye
          key={side}
          ink={ink}
          register={(node) => {
            eyes.current[index] = node;
            if (node) placeOnHead(node, { x: side * EYE.x, y: EYE.y, inset: 0.006 });
          }}
        />
      ))}
      {SIDES.map((side, index) => (
        <Cheek
          key={side}
          register={(node) => {
            cheeks.current[index] = node;
            if (node) placeOnHead(node, { x: side * 0.33, y: -0.12, inset: -0.004 });
          }}
        />
      ))}
      {/* Ein halber Torus, um 180° gedreht: ein Lächeln. */}
      <mesh
        renderOrder={FACE_ORDER}
        ref={(node) => {
          mouth.current = node;
          if (node) placeOnHead(node, { x: 0, y: -0.165, inset: 0.004, roll: Math.PI });
        }}
        scale={[1, 0.65, 1]}
      >
        <torusGeometry args={[0.072, 0.015, 12, 28, Math.PI]} />
        <meshBasicMaterial color={ink} />
      </mesh>
    </group>
  );
}
