// Outline, Vertex-Teil: schiebt jeden Vertex entlang seiner Normale um uWidth nach außen.
// Mit BackSide gezeichnet bleibt so ein Rand in Tintenfarbe hinter dem eigentlichen Teil sichtbar.

uniform float uWidth;
uniform float uDepthBias;
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
  vec4 viewPosition = modelViewMatrix * vec4(waved(position) + normal * uWidth, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  // Nur die Tiefe rückt zur Kamera, das Bild bleibt, wo es ist. Siehe DEPTH_BIAS in cosmetic.ts.
  vec4 nearer = projectionMatrix * (viewPosition + vec4(0.0, 0.0, uDepthBias, 0.0));
  gl_Position.z = nearer.z / nearer.w * gl_Position.w;
}
