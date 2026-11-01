// Outline, Fragment-Teil: einfarbig in uInk.

uniform vec3 uInk;
void main() {
  gl_FragColor = vec4(uInk, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
