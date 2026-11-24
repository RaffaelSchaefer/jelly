// Ring around a stack, fragment shader: a thick arc that runs out like a clock over a faint track,
// with a bright spark at its end, set in a dark yard so it reads on the bright floor. Ripples run in
// toward the tower and invite others to climb it. In the last seconds the arc pulses. Seen from far
// away, arc and glow keep a least width on screen. RING_RADIUS, ARC_WIDTH, TRACK_WIDTH, LEAST_PIXELS,
// TICKS and RIPPLE_RATE come as #defines from stackRings.ts.

uniform float uTime;
uniform float uMotion;
uniform vec3 uCore;
uniform vec3 uEdge;
uniform vec3 uHot;
uniform vec3 uYard;
varying vec2 vLocal;
// Share of time left, presence, urgency and pulse.
varying vec4 vClock;
varying float vPhase;

const float TAU = 6.28318;

/** A soft line at `center`, 1 on the line and fading to 0 at about `width` away. */
float softLine(float value, float center, float width) {
  float offset = (value - center) / width;
  return exp(-offset * offset);
}

/**
 * The point on the ring at `share` of a turn. Turns start on the near side, where no tower hides
 * them, and run clockwise as the camera sees it.
 */
vec2 findRingPoint(float share) {
  float angle = share * TAU;
  return RING_RADIUS * vec2(-sin(angle), cos(angle));
}

/** Distance to the arc from the far side to `share` of a turn, with round ends. */
float findArcDistance(vec2 point, float turn, float share) {
  if (turn <= share) return abs(length(point) - RING_RADIUS);
  return min(length(point - findRingPoint(0.0)), length(point - findRingPoint(share)));
}

void main() {
  float share = vClock.x;
  float urgency = vClock.z;
  float pulse = vClock.w;
  float reach = length(vLocal);
  float turn = fract(atan(-vLocal.x, vLocal.y) / TAU);
  float pixel = fwidth(reach);
  float halfWidth = max(0.5 * ARC_WIDTH, LEAST_PIXELS * pixel) * (1.0 + 0.3 * pulse);
  float toArc = share > 0.0 ? findArcDistance(vLocal, turn, share) : 1e3;
  float arc = 1.0 - smoothstep(halfWidth - pixel, halfWidth + pixel, toArc);
  float core = 1.0 - smoothstep(0.0, halfWidth, toArc);
  float tick = smoothstep(0.82, 0.97, cos(turn * TAU * TICKS));
  float onTrack = abs(reach - RING_RADIUS) - max(0.5 * TRACK_WIDTH, pixel) * (1.0 + tick);
  float track = 0.55 * (1.0 - smoothstep(-pixel, pixel, onTrack));
  float glow = softLine(toArc, 0.0, max(0.5, 3.0 * LEAST_PIXELS * pixel)) * (0.3 + 0.5 * pulse);
  float spark = share > 0.0 ? softLine(length(vLocal - findRingPoint(share)), 0.0, 0.3 + 0.15 * pulse) : 0.0;
  float wave = fract(uTime * RIPPLE_RATE + vPhase);
  float rippleRadius = RING_RADIUS + halfWidth + 0.15 + (1.0 - wave) * 0.9;
  float ripple = softLine(reach, rippleRadius, 0.07) * wave * (1.0 - urgency) * uMotion * 0.7;
  float light = min(1.0, arc + track + glow + spark + ripple);
  // Brighter toward the spark, so the arc reads as running out.
  float along = share > 0.0 ? clamp(turn / share, 0.0, 1.0) : 0.0;
  vec3 lit = mix(uEdge, uCore, max(core * (0.35 + 0.65 * along), ripple));
  lit = mix(lit, uHot, max(spark, 0.75 * pulse * core));
  // The yard follows the arc, so a short arc does not leave a gray smudge around the tower.
  float yard = 0.32 * softLine(toArc, 0.0, 0.7) + 0.1 * softLine(reach, RING_RADIUS, 0.5);
  gl_FragColor = vec4(mix(uYard, lit, light), max(yard, light) * vClock.y);
  #include <colorspace_fragment>
}
