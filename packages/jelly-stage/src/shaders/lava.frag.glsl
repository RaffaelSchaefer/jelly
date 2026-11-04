// Lava lamp in the lounge, fragment shader: soft wax blobs rise and sink through glowing liquid,
// drawn as seen from the front. GLASS_HEIGHT and GLASS_RADIUS come from lounge.ts.

uniform float uTime;
uniform vec3 uLiquid;
uniform vec3 uWax;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vToCamera;

float measureWax(vec2 point) {
  float field = 0.0;
  for (int index = 0; index < 4; index++) {
    float seed = float(index);
    float rise = 0.5 + 0.5 * sin(uTime * (0.21 + 0.06 * seed) + seed * 1.9);
    vec2 center = vec2(
      0.3 * GLASS_RADIUS * sin(uTime * 0.27 + seed * 2.4),
      mix(0.18, 0.85, rise) * GLASS_HEIGHT
    );
    float size = GLASS_RADIUS * (0.34 + 0.07 * seed);
    vec2 offset = point - center;
    field += size * size / max(dot(offset, offset), 0.0001);
  }
  // Wax waits in a pool at the bottom until it rises again.
  return field + 1.4 * (1.0 - smoothstep(0.0, 0.16 * GLASS_HEIGHT, point.y));
}

void main() {
  float wax = smoothstep(0.85, 1.15, measureWax(vLocal.xy));
  vec3 color = mix(uLiquid, uWax, wax);
  // The bulb heats from below, so the lamp is brightest at the bottom.
  color *= mix(1.15, 0.8, clamp(vLocal.y / GLASS_HEIGHT, 0.0, 1.0));
  float facing = abs(dot(normalize(vNormal), normalize(vToCamera)));
  color += vec3(0.35) * pow(1.0 - facing, 3.0);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
