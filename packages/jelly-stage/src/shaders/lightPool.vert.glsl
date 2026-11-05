// Pool of light under a highlighted jelly, vertex shader: passes on the position on the plane, from
// -1 to 1 on both axes.

varying vec2 vLocal;

void main() {
  vLocal = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
