// Rings around jellies that can be chosen, vertex shader for the ring on the floor and the curtain
// above it: passes on where a point lies around the jelly and how high.

attribute float aPresence;
attribute float aPhase;
varying vec2 vLocal;
varying float vHeight;
varying float vPresence;
varying float vPhase;

void main() {
  vLocal = position.xz;
  vHeight = uv.y;
  vPresence = aPresence;
  vPhase = aPhase;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
