// The ground of the 3D opening title, vertex shader: a quad over the whole picture.

void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
