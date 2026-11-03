// Soft shadow on the floor, vertex shader: passes the position on the shadow plane on.

varying vec2 vLocal;

void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
