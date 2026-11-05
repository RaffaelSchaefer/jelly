// Ring on the floor around a jelly that can be chosen: a breathing line in a soft glow, a shimmer that
// runs around it with the colors of a soap film, and a wave that leaves it now and then. RING_RADIUS
// comes as a #define from choiceRings.ts.

uniform float uTime;
uniform vec3 uGold;
uniform vec3 uHot;
varying vec2 vLocal;
varying float vPresence;
varying float vPhase;

/** A soft line at `center`, 1 on the line and fading to 0 at about `width` away. */
float softLine(float value, float center, float width) {
  float offset = (value - center) / width;
  return exp(-offset * offset);
}

void main() {
  float reach = length(vLocal);
  float angle = atan(vLocal.y, vLocal.x);
  float time = uTime + vPhase;
  float breath = 0.5 + 0.5 * sin(time * 2.2);
  float radius = RING_RADIUS + 0.05 * breath;
  float line = softLine(reach, radius, 0.085);
  float glow = softLine(reach, radius, 0.5) * (0.28 + 0.14 * breath);
  float wave = fract(time * 0.38);
  float ripple = softLine(reach, radius + wave * 0.85, 0.07) * (1.0 - wave) * 0.55;
  float sweep = 0.5 + 0.5 * cos(angle * 2.0 - time * 1.9);
  vec3 film = 0.5 + 0.5 * cos(6.28318 * (angle / 3.14159 + time * 0.14 + vec3(0.0, 0.33, 0.67)));
  vec3 color = mix(uGold, film, 0.6 * pow(sweep, 2.0));
  color = mix(color, uHot, line * pow(sweep, 12.0));
  float alpha = min(1.0, line + glow + ripple) * vPresence;
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}
