// The 3D opening title of the Jelly-News, vertex shader: hands normal, place in the part, in the
// world and seen from the camera on to newsTitle.frag.glsl, with the colours of the part. Colour,
// lower edge and neon come per vertex from the model, as on a cosmetic.

attribute vec3 aColor;
attribute vec3 aGlowRange;
attribute float aNeon;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorld;
varying vec3 vViewPosition;
varying vec3 vColor;
varying vec3 vGlow;
varying vec3 vGlowRange;
varying float vNeon;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  vColor = aColor;
  // The light lower edge is the colour, 45 % toward white, as on a cosmetic.
  vGlow = mix(aColor, vec3(1.0), 0.45);
  vGlowRange = aGlowRange;
  vNeon = aNeon;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 viewPosition = viewMatrix * world;
  vViewPosition = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}
