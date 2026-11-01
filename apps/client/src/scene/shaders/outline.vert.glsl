// Outline, Vertex-Teil: schiebt jeden Vertex entlang seiner Normale um uWidth nach außen.
// Mit BackSide gezeichnet bleibt so ein Rand in Tintenfarbe hinter dem eigentlichen Teil sichtbar.

uniform float uWidth;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uWidth, 1.0);
}
