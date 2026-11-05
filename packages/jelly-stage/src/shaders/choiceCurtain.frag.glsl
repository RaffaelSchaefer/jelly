// Low curtain of light above the ring of a jelly that can be chosen: it fades upward, its colors
// shimmer around the jelly and specks rise in it.

uniform float uTime;
uniform vec3 uGold;
uniform vec3 uHot;
varying vec2 vLocal;
varying float vHeight;
varying float vPresence;
varying float vPhase;

void main() {
  float angle = atan(vLocal.y, vLocal.x);
  float time = uTime + vPhase;
  float fade = pow(1.0 - vHeight, 1.8);
  float sweep = 0.5 + 0.5 * cos(angle * 2.0 - time * 1.9);
  vec3 film = 0.5 + 0.5 * cos(6.28318 * (angle / 3.14159 + time * 0.14 + vec3(0.0, 0.33, 0.67)));
  vec3 color = mix(uGold, film, 0.6 * pow(sweep, 2.0));
  float rays = 0.72 + 0.28 * sin(angle * 11.0 + time * 0.8);
  float dust = findDust(vec2(angle * 4.0, vHeight * 7.0 - time * 1.1));
  float alpha = fade * (0.34 * rays + 0.3 * pow(sweep, 4.0)) + 0.7 * dust * fade;
  gl_FragColor = vec4(mix(color, uHot, dust), min(1.0, alpha) * vPresence);
  #include <colorspace_fragment>
}
