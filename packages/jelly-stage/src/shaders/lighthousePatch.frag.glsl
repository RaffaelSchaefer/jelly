// Lighthouse on a stack, fragment shader for the patch its cone throws on the floor: a long oval of
// colored light in a dark yard, so it reads on the bright floor, with a fading trail where the light
// just passed. Along x the plane points away from the tower, along y back against the turn.
// PATCH_LENGTH and PATCH_WIDTH, half the size of the plane, and SPOT_LENGTH and SPOT_WIDTH, half the
// size of the bright spot, come as #defines from lighthouse.ts.

uniform float uPresence;
uniform vec3 uCore;
uniform vec3 uEdge;
uniform vec3 uYard;
varying vec2 vLocal;

void main() {
  vec2 point = vLocal * vec2(PATCH_LENGTH, PATCH_WIDTH);
  float spot = length(point / vec2(SPOT_LENGTH, SPOT_WIDTH));
  float glow = 1.0 - smoothstep(0.2, 1.0, spot);
  float core = 1.0 - smoothstep(0.0, 0.5, spot);
  float behind = clamp(point.y / PATCH_WIDTH, 0.0, 1.0);
  float narrow = point.x / (0.7 * SPOT_LENGTH * (1.0 - 0.6 * behind));
  float trail = exp(-narrow * narrow) * pow(1.0 - behind, 2.0) * step(0.0, point.y);
  float light = min(1.0, 0.95 * glow + 0.7 * trail);
  float yard = 0.45 * (1.0 - smoothstep(0.5, 1.25, spot)) + 0.3 * trail;
  vec3 lit = mix(uEdge, uCore, max(core, 0.5 * glow));
  lit = mix(lit, vec3(1.0), 0.5 * core);
  gl_FragColor = vec4(mix(uYard, lit, light), max(yard, light) * uPresence);
  #include <colorspace_fragment>
}
