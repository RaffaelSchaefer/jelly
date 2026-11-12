// Floor of the stage, vertex shader: passes the floor position in jelly units on, and the position
// on the plane itself, which spans FLOOR_REACH times the room on both axes.

varying vec2 vFloor;
varying vec2 vPlane;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vFloor = world.xz;
  vPlane = position.xy;
  gl_Position = projectionMatrix * viewMatrix * world;
}
