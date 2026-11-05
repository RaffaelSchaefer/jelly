// Speaker cone, fragment shader: a rubber ring outside, the dark cone and a dust cap in the middle.
// The cone lights up a little on every beat.

uniform vec3 uCone;
uniform vec3 uSurround;
uniform vec3 uCap;
varying vec2 vUv;
varying float vBeat;

void main() {
  float reach = length(vUv - 0.5) * 2.0;
  vec3 color = mix(uCap, uCone * (0.8 + 0.4 * reach), smoothstep(0.3, 0.34, reach));
  color = mix(color, uSurround, smoothstep(0.8, 0.84, reach));
  gl_FragColor = vec4(color + 0.08 * vBeat, 1.0);
  #include <colorspace_fragment>
}
