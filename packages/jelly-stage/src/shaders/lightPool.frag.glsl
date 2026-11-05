// Pool of light under a highlighted jelly, fragment shader: a dark yard that gives the light contrast
// on the bright floor, a colored glow in it, a bright line where the beam meets the floor and a ripple
// that runs outward. POOL_RADIUS, RIM_RADIUS and RIPPLE_RATE come as #defines from beams.ts.

uniform float uTime;
uniform float uPresence;
uniform vec3 uCore;
uniform vec3 uEdge;
uniform vec3 uYard;
varying vec2 vLocal;

/** A soft line at `center`, 1 on the line and fading to 0 at about `width` away. */
float softLine(float value, float center, float width) {
  float offset = (value - center) / width;
  return exp(-offset * offset);
}

void main() {
  float reach = length(vLocal);
  float distance = reach * POOL_RADIUS;
  float yard = 0.42 * (1.0 - smoothstep(0.0, 1.0, reach));
  float glow = 1.0 - smoothstep(0.0, RIM_RADIUS * 1.25, distance);
  float rim = softLine(distance, RIM_RADIUS, 0.13);
  float wave = fract(uTime * RIPPLE_RATE);
  float ripple = softLine(distance, RIM_RADIUS + wave * 1.6, 0.13) * (1.0 - wave);
  float light = min(1.0, 0.95 * glow + 0.9 * rim + 0.6 * ripple);
  vec3 lit = mix(uEdge, uCore, max(glow, rim));
  gl_FragColor = vec4(mix(uYard, lit, light), max(yard, light) * uPresence);
  #include <colorspace_fragment>
}
