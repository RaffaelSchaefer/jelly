// Garland of a conga line, vertex shader: hangs the cord and its bulbs between the two heads of a
// link, sagging by calculateSag of congaLines.ts, and turns both toward the camera. The first and the
// last bulb are the large ones on the two heads. A bulb lights up when the chase toward the head of
// the line reaches it. Between the heads the depth is pushed back, so the garland goes behind a face
// close behind it instead of across it. position holds the share along the garland and the corner of
// a vertex, aBulb the number of its bulb, negative on the cord. The #defines come from conga.ts.

uniform float uBeat;
uniform float uMotion;
// Two divided by the height of the picture in pixels.
uniform float uPixel;
attribute float aBulb;
attribute vec3 aFrom;
attribute vec3 aTo;
// Sag in the middle, presence, and the ranks of the follower and of its target in their line.
attribute vec4 aHang;
attribute vec3 aFromColor;
attribute vec3 aToColor;
varying vec2 vCorner;
varying vec3 vColor;
varying float vLight;
varying float vPresence;
varying float vBulb;

void main() {
  float share = position.x;
  float fromEnd = min(share, 1.0 - share);
  bool isBulb = aBulb >= 0.0;
  bool isOnHead = fromEnd < 0.01;
  vec3 span = aTo - aFrom;
  vec3 point = aFrom + span * share;
  point.y -= aHang.x * 4.0 * share * (1.0 - share);
  if (isBulb && !isOnHead) point.y -= BULB_DROP;
  vec4 viewPoint = modelViewMatrix * vec4(point, 1.0);
  // The size of a pixel at this depth, so cord and bulbs keep a least size from far away.
  float pixel = -viewPoint.z * uPixel / projectionMatrix[1][1];
  if (isBulb) {
    float radius = isOnHead ? HEAD_BULB_RADIUS : BULB_RADIUS;
    radius = max(radius, BULB_PIXELS * pixel) * mix(BULB_POP, 1.0, aHang.y);
    viewPoint.xy += position.yz * HALO_REACH * radius;
    vCorner = position.yz * HALO_REACH;
  } else {
    vec3 slope = span;
    slope.y -= aHang.x * 4.0 * (1.0 - 2.0 * share);
    vec2 along = (modelViewMatrix * vec4(slope, 0.0)).xy;
    vec2 across = normalize(vec2(-along.y, along.x) + vec2(1e-5, 0.0));
    viewPoint.xy += across * position.z * max(CORD_HALF, CORD_PIXELS * pixel);
    vCorner = position.yz;
  }
  // Counted from the head of the line, so the light runs through all links toward it. The bulb on a
  // head counts by the rank of its jelly, so it is lit the same in every link that ends there and
  // with the floor under it (calculateCongaPulse in congaLines.ts).
  float place = share > 0.99 ? aHang.w * LAST_BULB : aHang.z * LAST_BULB - aBulb;
  float phase = fract((place + uBeat * CHASE_STEPS) / CHASE_GROUP);
  vLight = mix(STILL_LIGHT, pow(1.0 - phase, CHASE_FADE), uMotion);
  vColor = mod(aBulb, 2.0) < 0.5 ? aFromColor : aToColor;
  vPresence = aHang.y;
  vBulb = aBulb;
  gl_Position = projectionMatrix * viewPoint;
  float push = DEPTH_PUSH * smoothstep(0.0, PUSH_RAMP, fromEnd * length(span));
  vec4 pushed = projectionMatrix * vec4(viewPoint.xyz * (1.0 + push / length(viewPoint.xyz)), 1.0);
  gl_Position.z = pushed.z / pushed.w * gl_Position.w;
}
