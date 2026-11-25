// Beamer screen on the stage, fragment shader. Between broadcasts it shows the test card of the
// channel, cut to the shape of the screen without stretching, with a slow scan line running down it
// unless motion is reduced. Until the card is decoded it plays the equalizer: three soft blobs in the
// jelly glow colors drift slowly over a dark screen, and a row of bars at the bottom jumps to the
// music, uSeed gives each screen its own dance. While the Jelly-News are on air, uOnAir fades their
// picture uBroadcast in over all of it. The screen glows by itself, so no light and no tone mapping
// touch it.

uniform float uTime;
uniform float uSeed;
uniform vec3 uBase;
uniform vec3 uColors[3];
uniform sampler2D uBroadcast;
uniform float uOnAir;
uniform sampler2D uTestCard;
// How much of the test card shows across and up, around its middle.
uniform vec2 uTestCardShare;
uniform float uTestCardReady;
// 1 lets the scan line run, 0 with reduced motion.
uniform float uLively;
varying vec2 vUv;

const float BAR_COUNT = 16.0;
// Share of the screen height the bars start at and reach at most.
const float BAR_FLOOR = 0.07;
const float BAR_REACH = 0.3;
// Test card and broadcast are projected pictures too: their corners fall off by this much, less than
// the blobs.
const float BROADCAST_FALLOFF = 0.16;
// The scan line takes this long from the top of the screen to its bottom, in seconds. Half its
// height as a share of the screen, and how much light it adds at its middle.
const float SCAN_SECONDS = 7.0;
const float SCAN_WIDTH = 0.045;
const float SCAN_GLOW = 0.07;

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

// The equalizer of the venue.
vec3 playEqualizer() {
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
  return mix(color, mix(pickColor(vUv.x), vec3(1.0), 0.25), findBar(vUv));
}

// Lets the corners of a projected picture fall off a little.
vec3 project(vec3 picture) {
  return picture * (1.0 - BROADCAST_FALLOFF * smoothstep(0.45, 0.8, length(vUv - 0.5)));
}

// The test card of the channel, with the scan line of an old transmitter running down it.
vec3 showTestCard() {
  vec3 card = texture(uTestCard, 0.5 + (vUv - 0.5) * uTestCardShare).rgb;
  float line = 1.0 - fract(uTime / SCAN_SECONDS);
  card += uLively * SCAN_GLOW * (1.0 - smoothstep(0.0, SCAN_WIDTH, abs(vUv.y - line)));
  return project(card);
}

void main() {
  vec3 color = uTestCardReady > 0.0 ? showTestCard() : playEqualizer();
  if (uOnAir > 0.0) {
    color = mix(color, project(texture(uBroadcast, vUv).rgb), uOnAir);
  }
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
