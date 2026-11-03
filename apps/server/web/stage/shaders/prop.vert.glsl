// Moving props of the venue, vertex shader: passes the position in the prop's own space and in the
// room on, with the normal and the way to the camera. Patterns can stick to the prop or to the room.

varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vToCamera;

void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vToCamera = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
