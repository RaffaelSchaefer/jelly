// Dance floor of a conga line, fragment shader: a soft round pool in the color of the dancer, flat
// in its middle like a lit floor tile and fading out to its rim, lighter in the middle while it
// flashes. Pools side by side melt into one patch of light. The #defines come from congaFloor.ts.

// From the middle of the pool, 1 at its rim.
varying vec2 vLocal;
// The color of the dancer and how bright its pool is, presence included.
varying vec4 vGlow;
// How strong a fully lit pool covers the floor at its size on screen.
varying float vStrength;

void main() {
  float reach = length(vLocal);
  float pool = 1.0 - smoothstep(POOL_CORE, 1.0, reach);
  float middle = 1.0 - smoothstep(0.0, POOL_CORE, reach);
  vec3 color = mix(vGlow.rgb, vec3(1.0), LIT_WHITE * middle * vGlow.a);
  gl_FragColor = vec4(color, vStrength * pool * vGlow.a);
  #include <colorspace_fragment>
}
