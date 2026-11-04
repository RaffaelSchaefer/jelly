// Beamer screen on the stage, fragment shader: three soft blobs in the jelly glow colors drift
// slowly over a dark screen, and a row of bars at the bottom jumps to the music. uSeed gives each
// screen its own dance. The screen glows by itself, so no light and no tone mapping touch it.

uniform float uTime;
uniform float uSeed;
uniform vec3 uBase;
uniform vec3 uColors[3];
varying vec2 vUv;

const float BAR_COUNT = 16.0;
// Share of the screen height the bars start at and reach at most.
const float BAR_FLOOR = 0.07;
const float BAR_REACH = 0.3;

float hash(float value) {
  return fract(sin(value * 12.9898 + uSeed * 4.1) * 43758.5453);
}

// Runs through the three glow colors from left to right.
vec3 pickColor(float share) {
  float place = clamp(share, 0.0, 1.0) * 2.0;
  return place < 1.0 ? mix(uColors[0], uColors[1], place) : mix(uColors[1], uColors[2], place - 1.0);
}

// 1 inside one of the jumping bars, 0 elsewhere.
float findBar(vec2 uv) {
  float column = floor(uv.x * BAR_COUNT);
  float inColumn = fract(uv.x * BAR_COUNT);
  float rate = 2.0 + 3.0 * hash(column);
  float level = 0.2 + 0.8 * abs(sin(uTime * rate + column * 0.7 + uSeed));
  float top = BAR_FLOOR + BAR_REACH * level;
  return step(0.18, inColumn) * step(inColumn, 0.82) * step(BAR_FLOOR, uv.y) * step(uv.y, top);
}

void main() {
  vec3 color = uBase;
  for (int index = 0; index < 3; index++) {
    float phase = uTime * 0.25 + uSeed * 3.0 + float(index) * 2.1;
    vec2 center = vec2(
      0.5 + 0.32 * sin(phase * 1.3 + float(index)),
      0.55 + 0.25 * cos(phase * 0.9 + float(index) * 1.7)
    );
    float distance = length((vUv - center) * vec2(SCREEN_ASPECT, 1.0));
    color += uColors[index] * (1.0 - smoothstep(0.0, 0.6, distance)) * 0.8;
  }
  // The edges fall off a little, like light from a projector.
  color *= 1.0 - 0.35 * smoothstep(0.3, 0.75, length(vUv - 0.5));
  color = mix(color, mix(pickColor(vUv.x), vec3(1.0), 0.25), findBar(vUv));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
