// Small light bulbs, vertex shader: places every bulb of the string and sets how bright it is now.
// aPhase is the place of a bulb in the pattern: random for twinkling, its number for a chase.
// BLINK_RATE comes from bulbs.ts.

uniform float uTime;
attribute vec3 aColor;
attribute float aPhase;
varying vec3 vColor;
varying float vLight;

void main() {
  vColor = aColor;
  vLight = 0.5 + 0.5 * cos(6.2831853 * (aPhase - uTime * BLINK_RATE));
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
