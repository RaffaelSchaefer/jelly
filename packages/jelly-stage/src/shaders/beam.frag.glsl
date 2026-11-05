// Light on a highlighted jelly, fragment shader for its beam and halo: a surface that looks like a
// volume of light, because it fades where it turns away from the camera. The beam also fades toward
// its top and carries bands and specks of rising dust. LIGHT_ALPHA, EDGE_SOFTNESS and, for the beam,
// BEAM come as #defines from beams.ts.

uniform float uTime;
uniform float uPresence;
uniform vec3 uCore;
uniform vec3 uEdge;
varying vec3 vNormal;
varying vec3 vToCamera;
varying vec2 vAround;
varying float vHeight;

void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vToCamera)));
  float volume = pow(smoothstep(0.0, 1.0, facing), EDGE_SOFTNESS);
  float alpha = LIGHT_ALPHA * volume;
  vec3 color = mix(uEdge, uCore, volume * volume);
  #ifdef BEAM
    float around = atan(vAround.y, vAround.x) / 6.28318;
    float bands = 0.8 + 0.2 * sin(around * 44.0 + vHeight * 9.0 + uTime * 0.7);
    float dust = findDust(vec2(around * 26.0, vHeight * 46.0 - uTime * 1.4)) * volume;
    float fade = pow(1.0 - vHeight, 0.85) * (1.0 - smoothstep(0.6, 1.0, vHeight));
    alpha = alpha * bands * fade + 0.6 * dust * fade * fade;
    color = mix(color, uCore, dust);
  #endif
  gl_FragColor = vec4(color, min(1.0, alpha) * uPresence);
  #include <colorspace_fragment>
}
