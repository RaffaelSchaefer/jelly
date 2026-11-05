// Specks of dust on a surface, shared by the beam and the choice rings. The caller lets its grid
// move, so they rise.

/** A bright speck in some cells of `grid`, 0 between them. */
float findDust(vec2 grid) {
  vec2 cell = floor(grid);
  float chance = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float speck = smoothstep(0.42, 0.08, length(fract(grid) - 0.5));
  return step(0.82, chance) * speck;
}
