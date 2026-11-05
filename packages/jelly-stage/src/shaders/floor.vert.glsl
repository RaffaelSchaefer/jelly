// Floor of the stage, vertex shader: passes the floor position in jelly units on.

varying vec2 vFloor;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vFloor = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
