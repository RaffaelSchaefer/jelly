// Kristallkugel, Vertex-Teil: Blicknormale und Richtung vom Mittelpunkt für crystal.frag.glsl.

varying vec3 vNormal;
varying vec3 vBall;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vBall = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
