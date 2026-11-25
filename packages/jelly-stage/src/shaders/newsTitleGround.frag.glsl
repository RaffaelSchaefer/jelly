// The ground of the 3D opening title, fragment shader: the channel blue of the band the logo stands
// on, light in the middle of the free area and deep at its corners, as newsBarBumper.ts paints it
// on the canvas, with a soft light behind the globe and slow rays around it. Colours are sRGB and
// mix as on the canvas: the picture goes out as it is, without tone mapping.

// The middle of the free area and half its diagonal, in pixels of the picture from its lower left.
uniform vec2 uMiddle;
uniform float uReach;
uniform vec3 uInner;
uniform vec3 uOuter;
uniform vec3 uLight;
// xy: the middle of the globe on the picture, z: its radius there, both in pixels.
uniform vec3 uGlobe;
uniform float uHalo;
uniform float uTurn;

const float RAYS = 14.0;

void main() {
  vec2 point = gl_FragCoord.xy;
  vec3 color = mix(uInner, uOuter, clamp(length(point - uMiddle) / uReach, 0.0, 1.0));
  vec2 away = point - uGlobe.xy;
  float reach = length(away) / max(uGlobe.z, 1.0);
  // Full right behind the globe, gone two radii out.
  float glow = exp(-pow(max(reach - 0.75, 0.0) * 1.7, 2.0));
  // Rays start at the edge of the globe and fade into the distance.
  float spoke = smoothstep(0.6, 1.0, 0.5 + 0.5 * cos(atan(away.y, away.x) * RAYS + uTurn));
  float rays = spoke * smoothstep(0.9, 1.4, reach) * exp(-reach * 0.32);
  color = mix(color, uLight, clamp(glow * 0.42 + rays * 0.16, 0.0, 1.0) * uHalo);
  gl_FragColor = vec4(color, 1.0);
}
