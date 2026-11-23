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
// Arme, die wedeln, wie die des Oktopus. xyz: der Punkt, von dem sie ausgehen, w: der Abstand, ab
// dem sie schwingen. Steht in toon.vert.glsl und outline.vert.glsl Zeichen für Zeichen gleich,
// damit Füllung und Outline dieselbe Bewegung machen.
uniform vec4 uWave;
// x: Ausschlag an der Spitze, y: Länge der Arme, z: Phase.
uniform vec3 uWaveMove;
vec3 waved(vec3 point) {
  vec3 arm = point - uWave.xyz;
  float far = clamp((length(arm) - uWave.w) / uWaveMove.y, 0.0, 1.0);
  if (uWaveMove.x == 0.0 || far <= 0.0) return point;
  // Quer zum Arm, in der Ebene zur Kamera. Der Winkel versetzt die Arme gegeneinander. Zwei
  // Schwingungen übereinander, die zweite schneller und kürzer: So schlackert er wie Wackelpudding.
  vec2 across = normalize(vec2(-arm.y, arm.x));
  float turn = atan(arm.y, arm.x);
  float swing = 0.65 * sin(uWaveMove.z - far * 4.0 + turn * 3.0)
    + 0.35 * sin(uWaveMove.z * 2.3 - far * 7.0 + turn * 5.0);
  return point + vec3(across, 0.0) * (uWaveMove.x * far * swing);
}
void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  // Teile mit aTint nehmen die Farbe des Trägers: bis 1 abgedunkelt, darüber zu Weiß hin. Negativ
  // nehmen sie ihre Gegenfarbe, gleich hell und satt, um einen halben Farbkreis gedreht.
  float lightest = max(uTint.r, max(uTint.g, uTint.b));
  float darkest = min(uTint.r, min(uTint.g, uTint.b));
  vec3 worn = aTint < 0.0 ? vec3(lightest + darkest) - uTint.rgb : uTint.rgb;
  float share = abs(aTint);
  vec3 tinted = share <= 1.0 ? worn * share : mix(worn, vec3(1.0), share - 1.0);
  vColor = mix(aColor, tinted, step(0.001, share) * uTint.w);
  // Die Leuchtfarbe ist die Grundfarbe, 45 % in Richtung Weiß.
  vGlow = mix(vColor, vec3(1.0), 0.45);
  vGlowRange = aGlowRange;
  vFluff = aFluff;
  vGlass = aGlass;
  vNeon = aNeon;
#ifdef SCENE_LIGHT
  // Lage und Normale in der Welt fürs Licht der Szene. Die Normale kommt aus der Blick-Normale zurück:
  // Die Ansicht dreht nur, und so stimmt sie auch am gestauchten Jelly.
  vWorldPos = (modelMatrix * vec4(waved(position), 1.0)).xyz;
  vWorldNormal = (vec4(vNormal, 0.0) * viewMatrix).xyz;
#endif
  vec4 viewPosition = modelViewMatrix * vec4(waved(position), 1.0);
  vViewPosition = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
  // Nur die Tiefe rückt zur Kamera, das Bild bleibt, wo es ist. Siehe DEPTH_BIAS in cosmetic.ts.
  vec4 nearer = projectionMatrix * (viewPosition + vec4(0.0, 0.0, uDepthBias, 0.0));
  gl_Position.z = nearer.z / nearer.w * gl_Position.w;
}
