// Outline, Vertex-Teil: schiebt jeden Vertex entlang seiner Normale um uWidth nach außen.
// Mit BackSide gezeichnet bleibt so ein Rand in Tintenfarbe hinter dem eigentlichen Teil sichtbar.

uniform float uWidth;
uniform float uDepthBias;
void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position + normal * uWidth, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  // Nur die Tiefe rückt zur Kamera, das Bild bleibt, wo es ist. Siehe DEPTH_BIAS in cosmetic.ts.
  vec4 nearer = projectionMatrix * (viewPosition + vec4(0.0, 0.0, uDepthBias, 0.0));
  gl_Position.z = nearer.z / nearer.w * gl_Position.w;
}
