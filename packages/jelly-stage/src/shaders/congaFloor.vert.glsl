// Dance floor of a conga line, vertex shader: spreads the pool of a dancer on the floor around the
// point of its instance. From far away a pool keeps a least size in pixels and grows stronger, so
// the line reads among the crowd, close up it stays faint beside the jellies. position holds the
// corner of the plane, from -1 to 1 on x and z. The #defines come from congaFloor.ts.

// Two divided by the height of the picture in pixels.
uniform float uPixel;
// The color of the dancer and how bright its pool is, presence included.
attribute vec4 aGlow;
varying vec2 vLocal;
varying vec4 vGlow;
varying float vStrength;

void main() {
  vec4 middle = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float pixel = -middle.z * uPixel / projectionMatrix[1][1];
  float radius = max(POOL_RADIUS, FAR_PIXELS * pixel);
  vStrength = mix(FAR_ALPHA, NEAR_ALPHA, smoothstep(FAR_PIXELS, NEAR_PIXELS, POOL_RADIUS / pixel));
  vLocal = position.xz;
  vGlow = aGlow;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position * radius, 1.0);
}
