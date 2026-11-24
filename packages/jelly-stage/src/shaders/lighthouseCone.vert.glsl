// Lighthouse on a stack, vertex shader for its cone of light: passes on where a point lies in the
// world, around the cone and along it.

varying vec3 vWorld;
varying vec2 vAround;
varying float vAlong;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vAround = position.xz;
  vAlong = uv.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
