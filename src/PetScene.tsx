import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { BackSide, BufferGeometry, Color, Group, MathUtils, Mesh, MeshBasicMaterial, Object3D, Vector2 } from 'three';
import { PET_COLORS, type PetColor } from './pet';
import { createBodyGeometry, createHandGeometry, createHeadGeometry, HAND, HEAD, headSurface } from './jellyGeometry';

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const outlineVertexShader = `
  uniform float uWidth;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uWidth, 1.0);
  }
`;
const outlineFragmentShader = `
  uniform vec3 uInk;
  void main() {
    gl_FragColor = vec4(uInk, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform vec3 uGlow;
  uniform vec2 uGlowRange;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 view = normalize(vViewPosition);
    float facing = max(dot(n, view), 0.0);
    float rim = pow(1.0 - facing, 2.5);
    // Each part glows from its own lower edge, deepening towards the top.
    float lowerGlow = 1.0 - smoothstep(uGlowRange.x, uGlowRange.y, vPosition.y);
    vec3 color = mix(uColor, uGlow, lowerGlow * 0.85);
    color *= 0.62 + 0.38 * facing;
    // Analytic softbox reflections keep the jelly glossy on a transparent desktop.
    float softbox = exp(-pow((n.x + 0.28) / 0.48, 2.0) - pow((n.y - 0.66) / 0.22, 2.0));
    float sideLight = exp(-pow((n.x + 0.88) / 0.12, 2.0) - pow((n.y - 0.12) / 0.65, 2.0));
    float underLight = pow(max(dot(n, normalize(vec3(0.3, -0.8, 0.4))), 0.0), 14.0);
    color += vec3(0.8, 0.92, 1.0) * softbox * 0.85;
    // Crisp glossy cap on top of each part, like light caught on a jelly sweet.
    float cap = exp(-pow((n.x + 0.05) / 0.42, 2.0) - pow((n.y - 0.7) / 0.2, 2.0)) * smoothstep(0.0, 0.35, n.z);
    color = mix(color, vec3(0.9, 0.97, 1.0), smoothstep(0.3, 0.8, cap) * 0.6);
    color += vec3(0.65, 0.9, 1.0) * sideLight * 0.6;
    color += uGlow * underLight * 0.55;
    color = mix(color, uColor * 0.22, rim * 0.8);
    color += uGlow * pow(1.0 - facing, 5.0) * 0.28;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function AnimationClock({ paused }: { paused: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) invalidate();
    }, 1000 / 30);
    return () => window.clearInterval(timer);
  }, [paused, invalidate]);
  return null;
}

const HEAD_GLOW = [0.1, 1.05] as const;
const BODY_GLOW = [-1.05, 0.05] as const;
const HAND_GLOW = [-HAND.radius, HAND.radius] as const;
const OUTLINE = 0.035;
/** How long the hands stay out after a poke or action. */
const HANDS_OUT_SECONDS = 1.6;

function GlossyPart({ geometry, color, range, layer = 0 }: { geometry: BufferGeometry; color: PetColor; range: readonly [number, number]; layer?: number }) {
  const outlineUniforms = useMemo(() => ({ uWidth: { value: OUTLINE }, uInk: { value: new Color(PET_COLORS[color].outline) } }), [color]);
  const uniforms = useMemo(() => ({
    uColor: { value: new Color(PET_COLORS[color].hex) },
    uGlow: { value: new Color(PET_COLORS[color].glow) },
    uGlowRange: { value: new Vector2(range[0], range[1]) },
  }), [color, range]);
  return (
    <>
      {/* Higher layers clear depth first, so they sit over the parts below like layered stickers
          and keep their full outline (the border round the head) instead of sinking into the body. */}
      <mesh geometry={geometry} renderOrder={layer * 2} onBeforeRender={layer > 0 ? (gl) => gl.clearDepth() : undefined}>
        <shaderMaterial side={BackSide} uniforms={outlineUniforms} vertexShader={outlineVertexShader} fragmentShader={outlineFragmentShader} />
      </mesh>
      <mesh geometry={geometry} renderOrder={layer * 2 + 1}>
        <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
      </mesh>
    </>
  );
}

/** Places a face feature on the head surface, facing outwards along the surface normal. */
function placeOnHead(object: Object3D, x: number, y: number, inset: number, roll = 0) {
  const [px, py, pz] = headSurface(x, y, inset);
  object.position.set(px, py, pz);
  const r2 = HEAD.radius * HEAD.radius;
  const nx = x / r2;
  const ny = y / r2;
  const nz = (pz + inset - HEAD.z) / (r2 * HEAD.depth * HEAD.depth);
  object.rotation.set(-Math.atan2(ny, Math.hypot(nx, nz)), Math.atan2(nx, nz), roll, 'YXZ');
}

const EYE_X = 0.19;
const EYE_Y = 0.0;
const FACE_ORDER = 6;

function Face({ color, eyes, mouth, cheeks }: { color: PetColor; eyes: React.RefObject<(Group | null)[]>; mouth: React.RefObject<Mesh | null>; cheeks: React.RefObject<(Mesh | null)[]> }) {
  const ink = PET_COLORS[color].ink;
  return (
    <group>
      {[-1, 1].map((side, index) => (
        <group key={side} ref={(node) => { eyes.current[index] = node; if (node) placeOnHead(node, side * EYE_X, EYE_Y, 0.006); }}>
          <mesh renderOrder={FACE_ORDER} scale={[0.058, 0.084, 0.022]}><sphereGeometry args={[1, 24, 16]} /><meshBasicMaterial color={ink} /></mesh>
          <mesh renderOrder={FACE_ORDER} position={[-0.016, 0.028, 0.021]} scale={[0.018, 0.023, 0.008]}><sphereGeometry args={[1, 12, 8]} /><meshBasicMaterial color="#f3ffff" /></mesh>
          <mesh renderOrder={FACE_ORDER} position={[0.015, -0.026, 0.022]} scale={[0.008, 0.01, 0.005]}><sphereGeometry args={[1, 12, 8]} /><meshBasicMaterial color="#8fdcff" /></mesh>
        </group>
      ))}
      {[-1, 1].map((side, index) => (
        <mesh key={side} ref={(node) => { cheeks.current[index] = node; if (node) placeOnHead(node, side * 0.33, -0.12, -0.004); }} scale={[0.075, 0.045, 1]} renderOrder={FACE_ORDER + 1}>
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial color="#ff5c9a" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      <mesh renderOrder={FACE_ORDER} ref={(node) => { mouth.current = node; if (node) placeOnHead(node, 0, -0.165, 0.004, Math.PI); }} scale={[1, 0.65, 1]}>
        <torusGeometry args={[0.072, 0.015, 12, 28, Math.PI]} />
        <meshBasicMaterial color={ink} />
      </mesh>
    </group>
  );
}

type CharacterProps = { color: PetColor; pulse: number; reducedMotion: boolean; holding?: boolean };

function Character({ color, pulse, reducedMotion, holding = false }: CharacterProps) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const hands = useRef<(Group | null)[]>([]);
  const eyes = useRef<(Group | null)[]>([]);
  const cheeks = useRef<(Mesh | null)[]>([]);
  const mouth = useRef<Mesh | null>(null);
  const geometry = useMemo(() => ({ head: createHeadGeometry(), body: createBodyGeometry(), hand: createHandGeometry() }), []);
  useEffect(() => () => Object.values(geometry).forEach((part) => part.dispose()), [geometry]);
  const state = useRef({ pulse, bounce: 0, pokedAt: -10, hands: 0, handsSpeed: 0, blinkAt: -1, nextBlink: 2 });

  useFrame(({ clock }, rawDelta) => {
    if (!root.current || !head.current) return;
    const s = state.current;
    const delta = Math.min(rawDelta, 0.1);
    const time = clock.elapsedTime;
    const motion = reducedMotion ? 0 : 1;
    if (s.pulse !== pulse) {
      s.pulse = pulse;
      s.bounce = 1;
      s.pokedAt = time;
    }
    s.bounce = MathUtils.damp(s.bounce, 0, 5, delta);
    const bounce = s.bounce * motion;
    const happy = s.bounce;

    // Body: gentle bob and sway, squash and hop when poked.
    const breathe = Math.sin(time * 1.9) * 0.015 * motion;
    root.current.position.y = (Math.sin(time * 1.9) * 0.04 + bounce * 0.28) * motion;
    root.current.rotation.z = Math.sin(time * 1.3) * 0.03 * motion;
    root.current.scale.set(1 + bounce * 0.1 - breathe, 1 - bounce * 0.13 + breathe, 1 + bounce * 0.1 - breathe);

    // Head bobs a beat behind the body and tilts a little.
    head.current.position.set(HEAD.x, HEAD.y + (Math.sin(time * 1.9 - 0.6) * 0.018 + bounce * 0.05) * motion, HEAD.z);
    head.current.rotation.set(0, 0, Math.sin(time * 0.9) * 0.04 * motion);

    // Blink now and then; squint happily and blush when poked.
    if (time > s.nextBlink) {
      s.blinkAt = time;
      s.nextBlink = time + 2.4 + Math.random() * 3.5;
    }
    const blinkPhase = (time - s.blinkAt) / 0.16;
    const blink = blinkPhase >= 0 && blinkPhase <= 1 ? Math.sin(blinkPhase * Math.PI) : 0;
    eyes.current.forEach((eye) => { if (eye) eye.scale.set(1 + happy * 0.05, Math.max(0.08, 1 - blink * 0.92 - happy * 0.35), 1); });
    cheeks.current.forEach((cheek) => { if (cheek) (cheek.material as MeshBasicMaterial).opacity = 0.5 * happy; });
    if (mouth.current) mouth.current.scale.set(1 + happy * 0.35, 0.65 + happy * 0.4, 1);

    // Orb hands only come out when he needs them: reacting to a poke/action, or holding something.
    const handsWanted = holding || time - s.pokedAt < HANDS_OUT_SECONDS ? 1 : 0;
    if (reducedMotion) {
      s.hands = handsWanted;
      s.handsSpeed = 0;
    } else {
      // Springy pop in, quick tuck away.
      s.handsSpeed += (handsWanted - s.hands) * 190 * delta;
      s.handsSpeed *= Math.exp(-(handsWanted ? 13 : 20) * delta);
      s.hands += s.handsSpeed * delta;
    }
    const out = Math.max(0, s.hands);
    hands.current.forEach((hand, index) => {
      if (!hand) return;
      hand.visible = out > 0.02;
      if (!hand.visible) return;
      const side = index === 0 ? -1 : 1;
      const float = Math.sin(time * 2.2 + index * 1.7) * 0.045 * motion;
      // They emerge from the sides of the body and fly up in a cheer on a poke.
      hand.position.set(
        side * (MathUtils.lerp(0.6, HAND.x, Math.min(out, 1.2)) + bounce * 0.14),
        HAND.y + (float + bounce * 0.55) * Math.min(out, 1),
        HAND.z,
      );
      hand.scale.setScalar(out);
    });
  });

  return (
    <group ref={root}>
      <GlossyPart geometry={geometry.body} color={color} range={BODY_GLOW} />
      {[-1, 1].map((side, index) => (
        <group key={side} ref={(node) => { hands.current[index] = node; }} position={[side * HAND.x, HAND.y, HAND.z]} scale={0} visible={false}>
          <GlossyPart geometry={geometry.hand} color={color} range={HAND_GLOW} layer={1} />
        </group>
      ))}
      <group ref={head} position={[HEAD.x, HEAD.y, HEAD.z]}>
        <group position={[-HEAD.x, -HEAD.y, -HEAD.z]}>
          <GlossyPart geometry={geometry.head} color={color} range={HEAD_GLOW} layer={2} />
          <Face color={color} eyes={eyes} mouth={mouth} cheeks={cheeks} />
        </group>
      </group>
    </group>
  );
}

class RenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p className="render-fallback" role="status">3D ist nicht verfügbar. Bitte Grafiktreiber und WebView prüfen. Die LAN-Aktionen funktionieren weiterhin.</p> : this.props.children;
  }
}

export default function PetScene(props: CharacterProps) {
  return (
    <RenderBoundary>
      <Canvas
        aria-hidden="true"
        camera={{ position: [0, 0.1, 5.8], fov: 34 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        frameloop="demand"
        fallback={<p className="render-fallback">Dieser WebView unterstützt kein WebGL.</p>}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <AnimationClock paused={props.reducedMotion} />
        <Character {...props} />
      </Canvas>
    </RenderBoundary>
  );
}
