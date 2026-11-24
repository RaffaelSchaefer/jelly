// Ring around a stack, vertex shader: passes on where a point lies around the stack and the clock of
// its instance.

attribute vec4 aClock;
attribute float aPhase;
varying vec2 vLocal;
varying vec4 vClock;
varying float vPhase;

void main() {
  vLocal = position.xz;
  vClock = aClock;
  vPhase = aPhase;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
