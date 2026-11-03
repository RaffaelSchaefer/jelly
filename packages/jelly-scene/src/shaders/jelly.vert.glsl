// Jelly-Körper, Vertex-Shader: reicht nur die Objektposition an den Fragment-Shader weiter.
// Die eigentliche Form entsteht per Raymarching in jelly.frag.glsl.

varying vec3 vObj;
void main() {
  vObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
