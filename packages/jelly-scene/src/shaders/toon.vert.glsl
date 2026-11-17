// Toon-Shader, Vertex-Teil: Normale, Objekt- und Blickposition für toon.frag.glsl, dazu die Farben.
// Alle Teile eines Cosmetics sind ein Mesh, Farbe und y-Bereich stehen deshalb je Teil in den Vertices.

attribute vec3 aColor;
attribute vec3 aGlowRange;
uniform float uDepthBias;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;
varying vec3 vColor;
varying vec3 vGlow;
varying vec3 vGlowRange;
#ifdef SCENE_LIGHT
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
#endif
void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  vColor = aColor;
  // Die Leuchtfarbe ist die Grundfarbe, 45 % in Richtung Weiß.
  vGlow = mix(aColor, vec3(1.0), 0.45);
  vGlowRange = aGlowRange;
#ifdef SCENE_LIGHT
  // Lage und Normale in der Welt fürs Licht der Szene. Die Normale kommt aus der Blick-Normale zurück:
  // Die Ansicht dreht nur, und so stimmt sie auch am gestauchten Jelly.
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorldNormal = (vec4(vNormal, 0.0) * viewMatrix).xyz;
#endif
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
  // Nur die Tiefe rückt zur Kamera, das Bild bleibt, wo es ist. Siehe DEPTH_BIAS in cosmetic.ts.
  vec4 nearer = projectionMatrix * (viewPosition + vec4(0.0, 0.0, uDepthBias, 0.0));
  gl_Position.z = nearer.z / nearer.w * gl_Position.w;
}
