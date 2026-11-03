// Rug of the lounge, fragment shader: a rounded rug with a wide border and rows of dots in the
// jelly colors. uHalfSize is half the rug in jelly units. It ignores the lights like the floor.

uniform vec2 uHalfSize;
uniform vec3 uField;
uniform vec3 uBorder;
uniform vec3 uLine;
uniform vec3 uDots[3];
varying vec3 vLocal;

const float CORNER = 0.45;
const float BORDER = 0.3;
const float LINE = 0.035;
const float DOT_GAP = 0.44;
const float DOT_RADIUS = 0.09;

// Distance to the edge of the rug, negative inside.
float measureEdge(vec2 point) {
  vec2 corner = abs(point) - uHalfSize + CORNER;
  return length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - CORNER;
}

vec3 paintDots(vec2 point) {
  // Every second row is shifted by half a dot, and the colors take turns.
  vec2 grid = point / DOT_GAP;
  float row = floor(grid.y);
  grid.x += 0.5 * mod(row, 2.0);
  float pick = mod(floor(grid.x) + row, 3.0);
  vec3 dotColor = pick < 1.0 ? uDots[0] : pick < 2.0 ? uDots[1] : uDots[2];
  float reach = length(fract(grid) - 0.5) * DOT_GAP;
  return mix(dotColor, uField, smoothstep(DOT_RADIUS - 0.012, DOT_RADIUS + 0.012, reach));
}

void main() {
  float inset = -measureEdge(vLocal.xy);
  if (inset < 0.0) discard;
  vec3 color = mix(uBorder, paintDots(vLocal.xy), smoothstep(BORDER - 0.012, BORDER + 0.012, inset));
  // A light line runs along the middle of the border.
  float line = 1.0 - smoothstep(LINE * 0.6, LINE, abs(inset - BORDER * 0.5));
  gl_FragColor = vec4(mix(color, uLine, line), 1.0);
  #include <colorspace_fragment>
}
