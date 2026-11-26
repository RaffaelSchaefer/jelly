// Garland of a conga line, fragment shader: a dark cord and round bulbs in the colors of the two
// jellies it ties together. A dark bulb keeps a dim color behind an inked rim, a lit one shines in
// its full color and throws a halo of it, so it also reads on the bright floor. The #defines come
// from conga.ts.

uniform vec3 uCord;
// On the cord how far across it, on a bulb how far from its middle, 1 at the rim.
varying vec2 vCorner;
varying vec3 vColor;
varying float vLight;
varying float vPresence;
varying float vBulb;

void main() {
  if (vBulb < 0.0) {
    float across = abs(vCorner.y);
    float cord = 1.0 - smoothstep(1.0 - fwidth(across), 1.0, across);
    gl_FragColor = vec4(uCord, cord * vPresence);
  } else {
    float reach = length(vCorner);
    float edge = fwidth(reach);
    float glass = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, reach);
    float rim = smoothstep(1.0 - RIM_WIDTH - edge, 1.0 - RIM_WIDTH + edge, reach);
    vec3 lit = mix(vColor, vec3(1.0), LIT_WHITE);
    vec3 body = mix(vColor * DARK_SHARE, lit, vLight);
    // A glint up left, like on the eyes of a jelly.
    float spot = length(vCorner - vec2(-GLINT_SPOT, GLINT_SPOT));
    float glint = 1.0 - smoothstep(GLINT_SIZE - edge, GLINT_SIZE + edge, spot);
    body = mix(body, vec3(1.0), GLINT_ALPHA * glint);
    body = mix(body, uCord, rim * (1.0 - RIM_GLOW * vLight));
    float fade = clamp((HALO_REACH - reach) / (HALO_REACH - 1.0), 0.0, 1.0);
    float halo = HALO_ALPHA * vLight * fade * fade;
    gl_FragColor = vec4(mix(lit, body, glass), max(glass, halo) * vPresence);
  }
  #include <colorspace_fragment>
}
