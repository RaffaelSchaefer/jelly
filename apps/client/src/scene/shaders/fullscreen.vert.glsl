// Ein Dreieck über die ganze Canvas, ohne Kamera. Die Form entsteht erst im Fragment-Shader.

void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
