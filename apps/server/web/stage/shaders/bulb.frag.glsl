// Small light bulbs, fragment shader: a lit bulb shines almost white, a dark one keeps a little of
// its color. Bulbs glow by themselves, so no light touches them.

varying vec3 vColor;
varying float vLight;

void main() {
  vec3 dark = vColor * 0.35;
  vec3 lit = mix(vColor, vec3(1.0), 0.45);
  gl_FragColor = vec4(mix(dark, lit, smoothstep(0.25, 0.75, vLight)), 1.0);
  #include <colorspace_fragment>
}
