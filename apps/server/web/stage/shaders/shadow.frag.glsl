// Soft shadow on the floor, fragment shader: a rounded rectangle that fades out at its border.

uniform vec3 uColor;
uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uSoftness;
uniform float uStrength;
varying vec2 vLocal;

void main() {
  vec2 corner = abs(vLocal) - uHalfSize + uRadius;
  float distance = length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - uRadius;
  float alpha = uStrength * (1.0 - smoothstep(-uSoftness, uSoftness, distance));
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
