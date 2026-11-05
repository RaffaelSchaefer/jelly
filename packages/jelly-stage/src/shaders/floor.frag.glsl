// Floor of the hall, fragment shader: light hexagon tiles with thin grout. A few tiles carry a
// faint jelly color. Toward the edges the floor fades into the background, so the room has no hard
// border. TILE_SIZE, GROUT, TINT_SHARE and the room size come as defines from floor.ts.

uniform vec3 uTile;
uniform vec3 uGrout;
uniform vec3 uBackground;
uniform vec3 uTints[3];
varying vec2 vFloor;

// Width and height of one hexagon cell, pointy side up.
const vec2 HEX = vec2(1.0, 1.7320508);

float hash(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}

// The offset from the middle of the hexagon under p (xy) and the id of that hexagon (zw).
vec4 findHexagon(vec2 p) {
  vec4 centers = floor(vec4(p, p - vec2(0.5, 1.0)) / HEX.xyxy) + 0.5;
  vec4 offsets = vec4(p - centers.xy * HEX, p - (centers.zw + 0.5) * HEX);
  return dot(offsets.xy, offsets.xy) < dot(offsets.zw, offsets.zw)
    ? vec4(offsets.xy, centers.xy)
    : vec4(offsets.zw, centers.zw + 0.5);
}

void main() {
  vec4 hexagon = findHexagon(vFloor / TILE_SIZE);
  vec2 offset = abs(hexagon.xy);
  // 0.5 at the middle of an edge, 0 on the edge itself.
  float edge = 0.5 - max(dot(offset, HEX * 0.5), offset.x);
  float blur = fwidth(edge);
  float grout = 1.0 - smoothstep(GROUT - blur, GROUT + blur, edge);

  float random = hash(hexagon.zw);
  vec3 tile = uTile * (0.985 + 0.03 * hash(hexagon.zw + 7.0));
  if (random < TINT_SHARE) {
    int tint = int(floor(random / TINT_SHARE * 3.0));
    tile = mix(tile, uTints[tint], 0.22);
  }
  vec3 color = mix(tile, uGrout, grout);

  // An ellipse a bit larger than the room, beyond which only the background is left.
  float reach = length(vFloor / (vec2(ROOM_WIDTH, ROOM_DEPTH) * 0.5));
  color = mix(color, uBackground, smoothstep(1.05, 1.7, reach));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
