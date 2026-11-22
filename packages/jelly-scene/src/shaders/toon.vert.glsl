// Toon-Shader, Vertex-Teil: Normale, Objekt- und Blickposition für toon.frag.glsl, dazu die Farben.
// Alle Teile eines Cosmetics sind ein Mesh, Farbe, y-Bereich, Flausch, Einfärbung, Glas und Neon stehen
// deshalb je Teil in den Vertices. Die Farbe des Trägers kommt als Uniform: Alle Jellies teilen das
// Modell.

attribute vec3 aColor;
attribute vec3 aGlowRange;
attribute float aFluff;
attribute float aTint;
attribute float aGlass;
attribute float aNeon;
uniform float uDepthBias;
// Farbe des Trägers, linear. w = 1, wenn er eine gewählt hat.
uniform vec4 uTint;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;
varying vec3 vColor;
varying vec3 vGlow;
varying vec3 vGlowRange;
varying float vFluff;
varying float vGlass;
varying float vNeon;
#ifdef SCENE_LIGHT
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
#endif
void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  // Teile mit aTint nehmen die Farbe des Trägers: bis 1 abgedunkelt, darüber zu Weiß hin.
  vec3 tinted = aTint <= 1.0 ? uTint.rgb * aTint : mix(uTint.rgb, vec3(1.0), aTint - 1.0);
  vColor = mix(aColor, tinted, step(0.001, aTint) * uTint.w);
  // Die Leuchtfarbe ist die Grundfarbe, 45 % in Richtung Weiß.
  vGlow = mix(vColor, vec3(1.0), 0.45);
  vGlowRange = aGlowRange;
  vFluff = aFluff;
  vGlass = aGlass;
  vNeon = aNeon;
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
