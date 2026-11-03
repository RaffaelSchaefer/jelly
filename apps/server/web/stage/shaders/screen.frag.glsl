// Beamer screen on the stage, fragment shader: three soft blobs in the jelly glow colors drift
// slowly over a dark screen. uSeed gives each screen its own dance. The screen glows by itself, so
// no light and no tone mapping touch it.

uniform float uTime;
uniform float uSeed;
uniform vec3 uBase;
uniform vec3 uColors[3];
varying vec2 vUv;

void main() {
  vec3 color = uBase;
  for (int index = 0; index < 3; index++) {
    float phase = uTime * 0.25 + uSeed * 3.0 + float(index) * 2.1;
    vec2 center = vec2(
      0.5 + 0.32 * sin(phase * 1.3 + float(index)),
      0.5 + 0.28 * cos(phase * 0.9 + float(index) * 1.7)
    );
    float distance = length((vUv - center) * vec2(SCREEN_ASPECT, 1.0));
    color += uColors[index] * (1.0 - smoothstep(0.0, 0.6, distance)) * 0.8;
  }
  // The edges fall off a little, like light from a projector.
  color *= 1.0 - 0.35 * smoothstep(0.3, 0.75, length(vUv - 0.5));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
