// Lighthouse on a stack, fragment shader for its cone of light. It looks like a volume: the light is
// as dense as the way the view ray takes through the cone is long, measured by how close the ray
// passes its axis. So it stays bright even when the camera looks along it. White hot at the lamp,
// colored further out, with specks of dust that fly outward, and still glowing where it meets the
// floor, so it joins its patch there. CONE_START and CONE_END, its radius at both ends, come as
// #defines from lighthouse.ts.

uniform float uTime;
uniform float uPresence;
uniform vec3 uCore;
uniform vec3 uEdge;
uniform vec3 uStart;
uniform vec3 uAxis;
varying vec3 vWorld;
varying vec2 vAround;
varying float vAlong;

/** How deep the view ray to this point runs through the cone, 1 through its axis, 0 at its rim. */
float findDepth() {
  vec3 ray = normalize(vWorld - cameraPosition);
  vec3 across = cross(ray, uAxis);
  float size = length(across);
  vec3 toStart = uStart - cameraPosition;
  // Looking straight along the axis, the ray passes it as far as the camera stands beside it.
  float gap = size > 0.001 ? abs(dot(toStart, across)) / size : length(cross(toStart, uAxis));
  float share = gap / mix(CONE_START, CONE_END, vAlong);
  return sqrt(max(0.0, 1.0 - share * share));
}

void main() {
  float volume = pow(findDepth(), 1.6);
  float around = atan(vAround.y, vAround.x) / 6.28318;
  float dust = findDust(vec2(around * 20.0, vAlong * 34.0 - uTime * 3.0)) * volume;
  float fade = smoothstep(0.0, 0.08, vAlong) * mix(1.0, 0.4, vAlong);
  float alpha = 0.6 * volume * fade + 0.55 * dust * fade;
  vec3 color = mix(uEdge, uCore, volume);
  color = mix(color, vec3(1.0), 0.6 * (1.0 - smoothstep(0.0, 0.35, vAlong)) * volume);
  gl_FragColor = vec4(mix(color, uCore, dust), min(1.0, alpha) * uPresence);
  #include <colorspace_fragment>
}
