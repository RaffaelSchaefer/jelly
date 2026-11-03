// Soft shadow on the floor, vertex shader: passes the position on the shadow plane on. It comes
// from the texture coordinates, so the merged shadows of many desks each keep their own middle.
// Instanced shadows, one per jelly, are placed by their instance matrix.

uniform vec2 uExtent;
varying vec2 vLocal;

void main() {
  vLocal = (uv - 0.5) * uExtent;
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  local = instanceMatrix * local;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * local;
}
