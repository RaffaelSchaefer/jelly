// Toon-Shader, Fragment-Teil: glänzendes Fruchtgummi-Material für Cosmetics.
// uGlowRange ist der y-Bereich des Teils, von unten (volles Leuchten) nach oben (Grundfarbe).

uniform vec3 uColor;
uniform vec3 uGlow;
uniform vec2 uGlowRange;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(vViewPosition);
  float facing = max(dot(n, view), 0.0);
  float rim = pow(1.0 - facing, 2.5);
  // Jedes Teil leuchtet von seiner eigenen Unterkante aus und wird nach oben dunkler.
  float lowerGlow = 1.0 - smoothstep(uGlowRange.x, uGlowRange.y, vPosition.y);
  vec3 color = mix(uColor, uGlow, lowerGlow * 0.85);
  color *= 0.62 + 0.38 * facing;
  // Analytische Softbox-Reflexe halten das Jelly auch auf transparentem Desktop glänzend.
  float softbox = exp(-pow((n.x + 0.28) / 0.48, 2.0) - pow((n.y - 0.66) / 0.22, 2.0));
  float sideLight = exp(-pow((n.x + 0.88) / 0.12, 2.0) - pow((n.y - 0.12) / 0.65, 2.0));
  float underLight = pow(max(dot(n, normalize(vec3(0.3, -0.8, 0.4))), 0.0), 14.0);
  color += vec3(0.8, 0.92, 1.0) * softbox * 0.85;
  // Scharfes Glanzlicht oben auf jedem Teil, wie Licht auf einem Fruchtgummi.
  float cap = exp(-pow((n.x + 0.05) / 0.42, 2.0) - pow((n.y - 0.7) / 0.2, 2.0)) * smoothstep(0.0, 0.35, n.z);
  color = mix(color, vec3(0.9, 0.97, 1.0), smoothstep(0.3, 0.8, cap) * 0.6);
  color += vec3(0.65, 0.9, 1.0) * sideLight * 0.6;
  color += uGlow * underLight * 0.55;
  color = mix(color, uColor * 0.22, rim * 0.8);
  color += uGlow * pow(1.0 - facing, 5.0) * 0.28;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
