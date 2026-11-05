// Light on a highlighted jelly, vertex shader for its beam and halo: passes on what the volume look
// needs.

varying vec3 vNormal;
varying vec3 vToCamera;
varying vec2 vAround;
varying float vHeight;

void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalMatrix * normal;
  vToCamera = -viewPosition.xyz;
  vAround = position.xz;
  vHeight = uv.y;
  gl_Position = projectionMatrix * viewPosition;
}
