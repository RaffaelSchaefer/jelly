// The ink rim of the 3D opening title, vertex shader: pushes every vertex out along its normal by
// uWidth, in units of the part. Drawn from behind, a rim in ink stays around the part, as the
// outline of a cosmetic does.

uniform float uWidth;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uWidth, 1.0);
}
