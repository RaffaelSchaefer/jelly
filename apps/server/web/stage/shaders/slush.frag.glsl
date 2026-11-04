// Slush tank of the snack bar, fragment shader: frozen slush turns in a clear tank. The stripes run
// around the tank and move on, like the spiral inside. FILL_TOP is the slush level from snacks.ts.

uniform float uTime;
uniform vec3 uSlush;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vToCamera;

const vec3 EMPTY = vec3(0.82, 0.92, 0.97);

void main() {
  float angle = atan(vLocal.z, vLocal.x);
  float swirl = sin(angle * 3.0 + vLocal.y * 18.0 - uTime * 2.4);
  vec3 slush = mix(uSlush * 0.75, mix(uSlush, vec3(1.0), 0.5), smoothstep(-0.3, 0.7, swirl));
  vec3 color = mix(slush, EMPTY, step(FILL_TOP, vLocal.y));
  float facing = abs(dot(normalize(vNormal), normalize(vToCamera)));
  color += vec3(0.3) * pow(1.0 - facing, 3.0);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
