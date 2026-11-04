// Speaker cone, vertex shader: the cone, a disc facing forward, grows a little on every beat.
// BEATS_PER_SECOND comes from stageSet.ts.

uniform float uTime;
varying vec2 vUv;
varying float vBeat;

void main() {
  vUv = uv;
  vBeat = pow(0.5 + 0.5 * cos(6.2831853 * uTime * BEATS_PER_SECOND), 8.0);
  vec3 moved = position;
  moved.xy *= 1.0 + 0.07 * vBeat;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0);
}
