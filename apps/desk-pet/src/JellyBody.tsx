// The pet's body, head and hands as one raymarched jelly: the parts melt into each other (signed
// distance fields with smooth union), the glow inside is seen through the refracting jelly, a studio
// reflects in its surface, and a little of the desktop shines through where it is thin. The face and
// cosmetics are ordinary meshes on top.
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { BoxGeometry, Color, CustomBlending, Group, MathUtils, Matrix4, Mesh, OneFactor, OneMinusSrcAlphaFactor, PerspectiveCamera, ShaderMaterial, SrcAlphaFactor, Vector2, Vector3, Vector4 } from 'three';
import { HAND, HEAD } from './jellyGeometry';
import { PET_COLORS, type PetColor } from './pet';

/** How much of the desktop shines through where the jelly is thin (0 = solid). */
const CLARITY = 0.3;

const vertexShader = `
  varying vec3 vObj;
  void main() {
    vObj = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform mat4 uModel;
  uniform mat4 uInvModel;
  uniform mat4 uViewProj;
  uniform vec3 uCamObj;
  uniform vec3 uHead;
  uniform vec2 uTilt;
  uniform vec4 uHands[2];
  uniform vec3 uColor;
  uniform vec3 uGlow;
  uniform vec3 uInk;
  uniform float uPixel;
  uniform float uClarity;
  varying vec3 vObj;

  const vec3 HEAD_R = vec3(${HEAD.radius.toFixed(3)}, ${HEAD.radius.toFixed(3)}, ${(HEAD.radius * HEAD.depth).toFixed(3)});
  const float OUTLINE = 0.035;
  const float IOR = 1.33;

  float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
  }
  float sdEllipsoid(vec3 p, vec3 r) {
    float k0 = length(p / r);
    return k0 * (k0 - 1.0) / (length(p / (r * r)) + 1e-6);
  }
  float sdEllipse(vec2 p, vec2 r) {
    float k0 = length(p / r);
    return k0 * (k0 - 1.0) / (length(p / (r * r)) + 1e-6);
  }
  // A box with only its lower corners rounded.
  float sdFoot(vec2 p, vec2 b, float r) {
    float rr = p.y < 0.0 ? r : 0.0;
    vec2 q = abs(p) - b + rr;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;
  }

  // The bell-shaped body of jellyGeometry.ts, turned round the y axis and 0.8 as deep as wide:
  // the upper half of an ellipse for the shoulders on a foot with a soft, flat base.
  float sdBody(vec3 p) {
    vec2 xz = vec2(p.x, p.z * 1.25);
    float rho = length(xz);
    vec2 q = vec2(rho, p.y);
    // Cut a little below the equator so the two overlap: a shared face would be a skin inside.
    float shoulders = max(sdEllipse(q - vec2(0.0, -0.55), vec2(0.86, 0.71)), -0.65 - p.y);
    float foot = sdFoot(q - vec2(0.0, -0.8), vec2(0.86, 0.25), 0.25);
    // Undo the depth stretch: exact at the silhouette, a safe underestimate towards the front.
    float stretch = length(vec2(p.x, p.z * 1.5625)) / max(rho, 1e-4);
    return min(shoulders, foot) / max(stretch, 1.0);
  }
  float sdHead(vec3 p) {
    vec3 q = p - uHead;
    q.xy = vec2(uTilt.x * q.x + uTilt.y * q.y, uTilt.x * q.y - uTilt.y * q.x);
    return sdEllipsoid(q, HEAD_R);
  }
  float sdHands(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < 2; i++) if (uHands[i].w > 0.0) d = min(d, length(p - uHands[i].xyz) - uHands[i].w);
    return d;
  }
  float map(vec3 p) {
    return smin(smin(sdBody(p), sdHead(p), 0.15), sdHands(p), 0.1);
  }
  vec3 calcNormal(vec3 p) {
    const vec2 e = vec2(1.0, -1.0) * 0.0015;
    return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
  }
  // Where two parts meet both are close: the neck, a hand popping out of the body.
  float crease(vec3 p) {
    float b = sdBody(p), h = sdHead(p), k = sdHands(p);
    return 1.0 - smoothstep(0.0, 0.28, min(max(b, h), min(max(b, k), max(h, k))));
  }

  // A soft studio around him: a key softbox top left, a strip light on the right, a glowing floor.
  float softbox(vec3 d, vec3 axis, vec2 size, float soft) {
    float c = dot(d, axis);
    if (c <= 0.0) return 0.0;
    vec3 right = normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, axis);
    vec2 q = abs(vec2(dot(d, right), dot(d, up)) / c) - size;
    return 1.0 - smoothstep(-soft, soft, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
  }
  vec3 env(vec3 d) {
    vec3 col = mix(uColor * 0.08, vec3(0.06, 0.08, 0.1), smoothstep(-0.4, 0.5, d.y));
    col += uGlow * 0.6 * (1.0 - smoothstep(-0.8, -0.1, d.y));
    col += vec3(14.0) * softbox(d, normalize(vec3(-0.45, 0.8, 0.45)), vec2(0.6, 0.3), 0.15);
    col += vec3(0.7, 0.85, 1.0) * 3.0 * softbox(d, normalize(vec3(1.0, 0.2, -0.25)), vec2(0.1, 0.8), 0.1);
    return col;
  }
  // Head and body each glow from their own lower edge and deepen towards the top (as before).
  float glowAt(vec3 p) {
    float head = smoothstep(-0.18, 0.18, sdBody(p) - sdHead(p));
    float y = mix((p.y + 1.05) / 1.1, (p.y - uHead.y + 0.56) / 0.95, head);
    return 1.0 - smoothstep(0.0, 1.0, y);
  }

  void main() {
    vec3 rd = normalize(vObj - uCamObj);
    vec3 ro = vObj;
    float t = 0.0, minD = 1e5, tMin = 0.0;
    bool hit = false;
    for (int i = 0; i < 96; i++) {
      float d = map(ro + rd * t);
      if (d < minD) { minD = d; tMin = t; }
      if (d < 0.0005) { hit = true; break; }
      t += d;
      if (t > 4.0) break;
    }

    vec3 color;
    float alpha;
    vec3 surface;
    if (hit) {
      vec3 p = ro + rd * t;
      vec3 n = calcNormal(p);
      vec3 nW = normalize(n * mat3(uInvModel));
      vec3 vW = normalize(mat3(uModel) * rd);
      float ndv = clamp(-dot(nW, vW), 0.0, 1.0);
      float fresnel = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);

      // Refract in and cross the jelly to its far wall; s is how thick it is along the way.
      vec3 inside = refract(rd, n, 1.0 / IOR);
      float s = 0.02;
      vec3 q = p + inside * s;
      for (int i = 0; i < 40; i++) {
        float d = map(q);
        if (d > -0.001) break;
        s += max(-d, 0.02);
        q = p + inside * s;
      }
      // The glow is seen partly on the surface and partly on the far wall through the jelly, bent
      // by the refraction: that offset is what makes it read as a thick, curved, clear body.
      float glow = mix(glowAt(p), glowAt(q), 0.6);
      vec3 jelly = mix(uColor, uGlow, glow * 0.85);
      jelly *= mix(1.12, 0.82, smoothstep(0.2, 1.3, s));
      jelly *= 0.62 + 0.38 * ndv;
      float ao = 1.0 - 0.5 * crease(p);
      color = jelly * ao + env(reflect(vW, nW)) * fresnel * ao;
      color = mix(color, uColor * 0.22, pow(1.0 - ndv, 2.5) * 0.7);
      alpha = 1.0 - uClarity * (1.0 - smoothstep(0.15, 1.1, s)) * (1.0 - fresnel);
      // Ink where the surface turns away: the toon rim, and antialiasing against the outline.
      float ink = 1.0 - smoothstep(0.0, 0.14, ndv);
      color = mix(color, uInk, ink);
      alpha = mix(alpha, 1.0, ink);
      surface = p;
    } else {
      // Rays that pass close by draw the outline round the whole silhouette.
      surface = ro + rd * tMin;
      float px = uPixel * distance(surface, uCamObj);
      alpha = 1.0 - smoothstep(OUTLINE - px, OUTLINE + px, minD);
      if (alpha <= 0.0) discard;
      color = uInk;
    }
    vec4 clip = uViewProj * uModel * vec4(surface, 1.0);
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Renders inside the pet's root group; reads the head and hand groups the character animates. */
export default function JellyBody({ color, head, hands }: { color: PetColor; head: RefObject<Group | null>; hands: RefObject<(Group | null)[]> }) {
  const mesh = useRef<Mesh>(null);
  // Everything the jelly can reach: hands thrown out in a cheer, the head bobbing, the outline.
  const geometry = useMemo(() => new BoxGeometry(3.3, 2.7, 1.7).translate(0, 0.16, 0.03), []);
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uModel: { value: new Matrix4() },
      uInvModel: { value: new Matrix4() },
      uViewProj: { value: new Matrix4() },
      uCamObj: { value: new Vector3() },
      uHead: { value: new Vector3(HEAD.x, HEAD.y, HEAD.z) },
      uTilt: { value: new Vector2(1, 0) },
      uHands: { value: [new Vector4(), new Vector4()] },
      uColor: { value: new Color() },
      uGlow: { value: new Color() },
      uInk: { value: new Color() },
      uPixel: { value: 0.01 },
      uClarity: { value: CLARITY },
    },
    vertexShader,
    fragmentShader,
    // Blended, but drawn with the opaque meshes so the face and cosmetics still go on top.
    blending: CustomBlending,
    blendSrc: SrcAlphaFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useEffect(() => {
    const u = material.uniforms;
    const paint = PET_COLORS[color];
    u.uColor.value.set(paint.hex);
    u.uGlow.value.set(paint.glow);
    u.uInk.value.set(paint.outline);
  }, [color, material]);

  const drawingBuffer = useMemo(() => new Vector2(), []);
  return (
    <mesh ref={mesh} geometry={geometry} material={material} onBeforeRender={(renderer, _scene, camera) => {
      // Runs after every useFrame, so the head and hands are where the face and the frame put them.
      if (!mesh.current) return;
      const u = material.uniforms;
      u.uModel.value.copy(mesh.current.matrixWorld);
      u.uInvModel.value.copy(mesh.current.matrixWorld).invert();
      u.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      u.uCamObj.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(u.uInvModel.value);
      if (head.current) {
        u.uHead.value.copy(head.current.position);
        u.uTilt.value.set(Math.cos(head.current.rotation.z), Math.sin(head.current.rotation.z));
      }
      hands.current.forEach((hand, index) => {
        if (hand) u.uHands.value[index].set(hand.position.x, hand.position.y, hand.position.z, hand.visible ? HAND.radius * hand.scale.x : 0);
      });
      renderer.getDrawingBufferSize(drawingBuffer);
      u.uPixel.value = 2 * Math.tan(MathUtils.degToRad((camera as PerspectiveCamera).fov) / 2) / drawingBuffer.y;
      material.uniformsNeedUpdate = true;
    }} />
  );
}
