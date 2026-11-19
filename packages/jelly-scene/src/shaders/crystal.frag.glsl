// Kristallkugel, Fragment-Teil: violett-blauer Nebel kreist um einen warmen Kern, dazu ein Lichtsaum
// am Rand und ein Glanz vom Fenster. uPulse (0 bis 1) lässt den Kern nach einem Kauf aufflammen und
// den Nebel schneller drehen. Steht uTime, steht auch der Nebel.

uniform float uTime;
uniform float uPulse;
uniform vec3 uDeep;
uniform vec3 uMist;
uniform vec3 uCore;
varying vec3 vNormal;
varying vec3 vBall;
void main() {
  vec3 n = normalize(vNormal);
  float facing = clamp(n.z, 0.0, 1.0);
  // Zum Rand hin gestaucht, als läge der Nebel tief im Glas.
  vec2 p = vBall.xy * mix(1.0, 0.72, facing);
  float r = length(p);
  // atan ist in der Mitte nicht bestimmt, dort liegt ohnehin der Kern.
  float angle = r > 1e-4 ? atan(p.y, p.x) : 0.0;
  float turn = angle + uTime * (0.55 + 1.2 * uPulse) + r * 4.5;
  // Der ganzzahlige Faktor 2 versteckt die Naht von atan.
  float mist = (sin(turn * 2.0) * 0.5 + 0.5) * (sin(r * 10.0 - uTime * 1.4) * 0.35 + 0.65);
  mist = smoothstep(0.45, 0.95, mist) * (1.0 - smoothstep(0.62, 0.98, r));
  vec3 color = mix(uDeep, uMist, mist * 0.8);
  color = mix(color, uCore, (1.0 - smoothstep(0.0, 0.38 + 0.2 * uPulse, r)) * (0.5 + 0.5 * uPulse));
  color += uMist * pow(1.0 - facing, 3.0) * 0.9;
  // Glanz vom Fenster, oben links.
  float glint = smoothstep(0.9, 0.97, dot(n, normalize(vec3(-0.42, 0.5, 0.76))));
  color = mix(color, vec3(1.0), glint * 0.9);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
