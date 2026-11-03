// Floor of the stage, fragment shader: long boards with staggered joints, lit by three colored
// spots that wander slowly over the stage. Like the floor of the room it ignores the lights, so its
// colors are the colors on screen. uSize is the stage in jelly units, the plane is centered on it.

uniform float uTime;
uniform vec2 uSize;
uniform vec3 uBoard;
uniform vec3 uJoint;
uniform vec3 uSpots[3];
varying vec3 vLocal;

const float BOARD_DEPTH = 0.42;
const float BOARD_LENGTH = 2.6;
const float JOINT_WIDTH = 0.025;
const float SPOT_RADIUS = 1.6;
const float SPOT_STRENGTH = 0.38;

float hash(float value) {
  return fract(sin(value * 91.345) * 47453.5453);
}

vec3 paintBoards(vec2 point) {
  float row = floor(point.y / BOARD_DEPTH);
  float along = point.x / BOARD_LENGTH + hash(row);
  float board = floor(along);
  vec2 inside = vec2(fract(along) * BOARD_LENGTH, fract(point.y / BOARD_DEPTH) * BOARD_DEPTH);
  float joint = min(
    min(inside.x, BOARD_LENGTH - inside.x),
    min(inside.y, BOARD_DEPTH - inside.y)
  );
  float shade = 0.93 + 0.12 * hash(row * 17.0 + board);
  // A faint grain runs along every board.
  float grain = 0.98 + 0.04 * sin(point.x * 7.0 + hash(row) * 40.0 + sin(point.x * 1.7) * 2.0);
  return mix(uJoint, uBoard * shade * grain, smoothstep(0.0, JOINT_WIDTH, joint));
}

vec3 paintSpots(vec2 point) {
  vec3 light = vec3(0.0);
  for (int index = 0; index < 3; index++) {
    float seed = float(index);
    vec2 center = vec2(
      0.4 * uSize.x * sin(uTime * (0.09 + 0.03 * seed) + seed * 2.1),
      0.25 * uSize.y * cos(uTime * (0.21 + 0.05 * seed) + seed * 1.3)
    );
    float falloff = 1.0 - smoothstep(0.0, SPOT_RADIUS, length(point - center));
    light += uSpots[index] * falloff * falloff;
  }
  return light * SPOT_STRENGTH;
}

void main() {
  vec3 color = paintBoards(vLocal.xy) + paintSpots(vLocal.xy);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
