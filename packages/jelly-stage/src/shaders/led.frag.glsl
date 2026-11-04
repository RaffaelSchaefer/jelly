// LED strips of the venue, fragment shader: the jelly glow colors flow along the strip. The color
// follows the position in the room, so all strips of the hall show one wave.

uniform float uTime;
uniform vec3 uColors[3];
varying vec3 vWorld;

// Jelly units for one round through the three colors, and rounds per second.
const float WAVE_LENGTH = 9.0;
const float FLOW_SPEED = 0.12;

void main() {
  float place = fract(vWorld.x / WAVE_LENGTH - uTime * FLOW_SPEED) * 3.0;
  vec3 color = place < 1.0
    ? mix(uColors[0], uColors[1], place)
    : place < 2.0
      ? mix(uColors[1], uColors[2], place - 1.0)
      : mix(uColors[2], uColors[0], place - 2.0);
  // LEDs shine a little whiter than their color.
  gl_FragColor = vec4(mix(color, vec3(1.0), 0.2), 1.0);
  #include <colorspace_fragment>
}
