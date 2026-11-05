// Toon-Shader, Vertex-Teil: Normale, Objekt- und Blickposition für toon.frag.glsl.

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}
