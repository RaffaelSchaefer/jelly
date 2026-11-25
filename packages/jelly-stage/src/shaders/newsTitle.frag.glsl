// The 3D opening title of the Jelly-News, fragment shader: the candy gloss of a cosmetic, as in
// toon.frag.glsl of @jelly/scene (shaded by how it faces the camera, softbox and cap highlights,
// a dark rim, a light lower edge, neon that shines by itself), plus two lights of its own: a glint
// that runs over the logo along a slant, and a light that runs round an orbit ring.

uniform float uGlint;
uniform float uGlintStrength;
uniform float uStreak;
uniform float uStreakStrength;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorld;
varying vec3 vViewPosition;
varying vec3 vColor;
varying vec3 vGlow;
varying vec3 vGlowRange;
varying float vNeon;

// The glint is a band this wide that runs along this slant over the logo, from lower left to upper
// right, in units of the title.
const vec2 GLINT_SLANT = vec2(0.912, 0.41);
const float GLINT_WIDTH = 0.2;
const float TAU = 6.2831853;

// The candy gloss of a cosmetic, without plush, glass or the light of a scene.
vec3 gloss(vec3 n, float facing) {
  float rim = pow(1.0 - facing, 2.5);
  float lowerGlow = (1.0 - smoothstep(vGlowRange.x, vGlowRange.y, vPosition.y)) * vGlowRange.z;
  vec3 color = mix(vColor, vGlow, lowerGlow * 0.85);
  color *= 0.62 + 0.38 * facing;
  float softbox = exp(-pow((n.x + 0.28) / 0.48, 2.0) - pow((n.y - 0.66) / 0.22, 2.0));
  float sideLight = exp(-pow((n.x + 0.88) / 0.12, 2.0) - pow((n.y - 0.12) / 0.65, 2.0));
  float underLight = pow(max(dot(n, normalize(vec3(0.3, -0.8, 0.4))), 0.0), 14.0);
  color += vec3(0.8, 0.92, 1.0) * softbox * 0.85;
  float cap = exp(-pow((n.x + 0.05) / 0.42, 2.0) - pow((n.y - 0.7) / 0.2, 2.0)) * smoothstep(0.0, 0.35, n.z);
  color = mix(color, vec3(0.9, 0.97, 1.0), smoothstep(0.3, 0.8, cap) * 0.6);
  color += vec3(0.65, 0.9, 1.0) * sideLight * 0.6;
  color += vGlow * underLight * 0.55;
  color = mix(color, vColor * 0.22, rim * 0.8);
  return color + vGlow * pow(1.0 - facing, 5.0) * 0.28;
}

// A light that runs round a ring, flat in the x–z plane of its part: a bright head, a fading tail.
float streak() {
  float angle = atan(vPosition.z, vPosition.x) / TAU + 0.5;
  float behind = fract(uStreak - angle);
  return exp(-behind * 7.0) * uStreakStrength;
}

void main() {
  vec3 n = normalize(vNormal);
  float facing = max(dot(n, normalize(vViewPosition)), 0.0);
  vec3 color = gloss(n, facing);
  float across = dot(vWorld.xy, GLINT_SLANT) - uGlint;
  color += vec3(1.0) * uGlintStrength * exp(-across * across / (GLINT_WIDTH * GLINT_WIDTH)) * smoothstep(0.2, 0.8, facing);
  color += mix(vGlow, vec3(1.0), 0.5) * streak() * 1.4;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Neon shines by itself, past shadow, gloss and tone mapping, brighter where it faces the camera.
  float hot = pow(facing, 4.0);
  vec3 neon = vColor * (1.0 + 0.3 * hot) + dot(vColor, vec3(0.2126, 0.7152, 0.0722)) * 0.25 * hot;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(neon, 1.0)).rgb, vNeon);
}
