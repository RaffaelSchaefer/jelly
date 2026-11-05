// Toon-Shader, Vertex-Teil: Normale, Objekt- und Blickposition für toon.frag.glsl, dazu die Farben.
// Alle Teile eines Cosmetics sind ein Mesh, Farbe und y-Bereich stehen deshalb je Teil in den Vertices.

attribute vec3 aColor;
attribute vec2 aGlowRange;
uniform float uDepthBias;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;
varying vec3 vColor;
varying vec3 vGlow;
varying vec2 vGlowRange;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  vColor = aColor;
  // Die Leuchtfarbe ist die Grundfarbe, 45 % in Richtung Weiß.
  vGlow = mix(aColor, vec3(1.0), 0.45);
  vGlowRange = aGlowRange;
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
  // Nur die Tiefe rückt zur Kamera, das Bild bleibt, wo es ist. Siehe DEPTH_BIAS in cosmetic.ts.
  vec4 nearer = projectionMatrix * (viewPosition + vec4(0.0, 0.0, uDepthBias, 0.0));
  gl_Position.z = nearer.z / nearer.w * gl_Position.w;
}
