/**
 * Das Schild des Jellys: eine Tafel wie am Flughafen, quer vor dem Bauch und zwischen beiden
 * Händen.
 *
 * Text und Papier stehen in der Textur (`signTexture.ts`), die Bewegung rechnet `pet/signs.ts`. Wie
 * die Cosmetics liegt die Tafel als Sticker über dem Jelly, aber in der Tinte seiner Farbe
 * umrandet.
 *
 * @module
 */

import { HAND, type Jelly } from "@jelly/scene";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExtrudeGeometry, Shape, ShapeGeometry, type Object3D } from "three";

import {
  boardAngle,
  boardPose,
  createBoardMotion,
  PET_COLORS,
  stepBoard,
  type PetColor,
} from "../pet";
import { createSignTexture, SIGN_TEXTURE } from "./signTexture";

/** Halbe Breite: Die Tafel reicht bis an die Hände, die sie halten (`HAND.x - HAND.radius`). */
const HALF_WIDTH = 0.92;

/** Halbe Höhe im Seitenverhältnis der Textur. */
const HALF_HEIGHT = (HALF_WIDTH * SIGN_TEXTURE.height) / SIGN_TEXTURE.width;

/** Ecken und Rand der Tafel in Einheiten des Jellys. Der Rand ist so breit wie der von Cosmetics. */
const CORNER = 0.1;
const OUTLINE = 0.035;

/** Dicke der Rückplatte, sichtbar nur beim Drehen. */
const THICKNESS = 0.05;

/** Abstand zur Vorderseite. In derselben Ebene würden sich beide beim Drehen flimmernd abwechseln. */
const FACE_GAP = 0.004;

/** Zeichenebene über den Cosmetics (`renderOrder` 8 und 9), siehe `cosmetic.ts` in `@jelly/scene`. */
const SIGN_ORDER = 10;

/** Ab dieser Größe wird die Tafel gezeichnet. */
const VISIBLE_FROM = 0.02;

/** Ein Rechteck mit runden Ecken um den Ursprung. */
function createRoundedShape(halfWidth: number, halfHeight: number, radius: number) {
  const right = halfWidth - radius;
  const top = halfHeight - radius;
  const shape = new Shape();
  shape.absarc(right, -top, radius, -Math.PI / 2, 0, false);
  shape.absarc(right, top, radius, 0, Math.PI / 2, false);
  shape.absarc(-right, top, radius, Math.PI / 2, Math.PI, false);
  shape.absarc(-right, -top, radius, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/** Die Vorderseite. `ShapeGeometry` legt die Textur in Metern an, sie soll sie aber ganz füllen. */
function createFaceGeometry() {
  const geometry = new ShapeGeometry(createRoundedShape(HALF_WIDTH, HALF_HEIGHT, CORNER), 8);
  const { position, uv } = geometry.attributes;
  for (let index = 0; index < uv!.count; index++) {
    uv!.setXY(
      index,
      (position!.getX(index) + HALF_WIDTH) / (2 * HALF_WIDTH),
      (position!.getY(index) + HALF_HEIGHT) / (2 * HALF_HEIGHT),
    );
  }
  return geometry;
}

/**
 * Die Rückplatte in Tinte. Sie ragt ringsum als Umriss heraus und liegt knapp hinter der
 * Vorderseite.
 */
function createPlateGeometry() {
  const shape = createRoundedShape(HALF_WIDTH + OUTLINE, HALF_HEIGHT + OUTLINE, CORNER + OUTLINE);
  const geometry = new ExtrudeGeometry(shape, {
    depth: THICKNESS,
    bevelEnabled: false,
    curveSegments: 8,
  });
  return geometry.translate(0, 0, -THICKNESS - FACE_GAP);
}

/** Alle Tafeln sehen gleich aus, und es gibt nur eine. Deshalb bleiben die Geometrien bestehen. */
const FACE = createFaceGeometry();
const PLATE = createPlateGeometry();

/**
 * Muss in der Wurzel des Jellys liegen: Sie liest die Lage der Hände im selben Koordinatensystem.
 *
 * @param label - Text auf der Tafel. `null` senkt sie, sie zeigt dabei weiter den alten Text.
 */
export default function SignBoard({
  jelly,
  label,
  color,
  reducedMotion,
}: {
  jelly: Jelly;
  label: string | null;
  color: PetColor;
  reducedMotion: boolean;
}) {
  const board = useRef<Object3D>(null);
  const motion = useMemo(createBoardMotion, []);
  const [{ texture, paint }] = useState(createSignTexture);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((_, delta) => {
    if (!board.current) return;
    const before = motion.shown;
    stepBoard(motion, label, delta, reducedMotion);
    if (motion.shown && motion.shown !== before) paint(motion.shown);
    const pose = boardPose(jelly.hands[0]!.position, jelly.hands[1]!.position);
    board.current.position.set(pose.x, pose.y, HAND.z);
    board.current.rotation.set(0, boardAngle(motion.flip), pose.tilt);
    board.current.scale.setScalar(Math.max(0, motion.raise));
    board.current.visible = motion.raise > VISIBLE_FROM;
  });

  return (
    <object3D ref={board} visible={false}>
      {/* Löscht vorher die Tiefe, damit die Tafel nicht im Jelly versinkt. */}
      <mesh geometry={PLATE} renderOrder={SIGN_ORDER} onBeforeRender={(gl) => gl.clearDepth()}>
        <meshBasicMaterial color={PET_COLORS[color].outline} />
      </mesh>
      <mesh geometry={FACE} renderOrder={SIGN_ORDER + 1}>
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </object3D>
  );
}
