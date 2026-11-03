// Lens of the stage camera, fragment shader: shows the finished picture through a mild fisheye.
// For each pixel it looks up where the flat picture had it, the inverse of bendToLens in lens.ts.
// The picture is already tone mapped and in sRGB, so it is copied as it is.

uniform sampler2D uPicture;
// Half width and half height of the screen, divided by half its diagonal.
uniform vec2 uHalfExtent;
uniform float uStrength;
varying vec2 vUv;

void main() {
  vec2 bent = (vUv * 2.0 - 1.0) * uHalfExtent;
  float bentRadius = length(bent);
  float straightRadius = tan(uStrength * bentRadius) / tan(uStrength);
  vec2 straight = bentRadius > 0.0 ? bent * (straightRadius / bentRadius) : bent;
  gl_FragColor = texture2D(uPicture, straight / uHalfExtent * 0.5 + 0.5);
}
