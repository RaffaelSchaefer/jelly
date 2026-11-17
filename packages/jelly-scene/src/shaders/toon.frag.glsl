// Toon-Shader, Fragment-Teil: glänzendes Fruchtgummi-Material für Cosmetics.
// vGlowRange ist der y-Bereich des Teils, von unten (volles Leuchten) nach oben (Grundfarbe), und
// in z, wie stark es leuchtet. Mit SCENE_LIGHT kommt das Licht einer Szene dazu (Block <scene-light>).

varying vec3 vColor;
varying vec3 vGlow;
varying vec3 vGlowRange;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;
#ifdef SCENE_LIGHT
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
#endif

// <scene-light>
// Licht der Szene (sceneLight.ts), in jelly.frag.glsl und toon.frag.glsl Zeichen für Zeichen gleich.
// Nur mit SCENE_LIGHT (Zahl der Lichter), sonst bleibt der Shader wie ohne diesen Block.
#ifdef SCENE_LIGHT
uniform float uSceneShade;
uniform vec4 uSceneLights[SCENE_LIGHT];
uniform vec3 uSceneColors[SCENE_LIGHT];
uniform vec3 uSceneRimDir;
uniform vec3 uSceneRimColor;

// Punktlichter auf einer Fläche mit Grundfarbe albedo, Lage pW und Normale nW in Weltkoordinaten.
// Das Licht greift um die Kante herum (wrap), bei der Reichweite w wirkt es halb so stark. Es hellt
// die Grundfarbe auf und legt nichts Festes darüber: Ein dunkler Hut bleibt dunkel. Zu 35 % zählt
// nur ihre Helligkeit, so zeigt sich warmes Kerzenlicht auch auf einem blauen Jelly.
vec3 sceneDiffuse(vec3 albedo, vec3 pW, vec3 nW) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < SCENE_LIGHT; i++) {
    vec3 toLight = uSceneLights[i].xyz - pW;
    float d2 = max(dot(toLight, toLight), 1e-4);
    float r2 = uSceneLights[i].w * uSceneLights[i].w;
    float wrap = clamp((dot(nW, toLight * inversesqrt(d2)) + 0.6) / 1.6, 0.0, 1.0);
    sum += uSceneColors[i] * wrap * wrap * r2 / (r2 + d2);
  }
  return sum * mix(albedo, vec3(dot(albedo, vec3(0.2126, 0.7152, 0.0722))), 0.35);
}

// Randlicht wie vom Mond: nur an Kanten, die sich vom Blick (vW, zur Kamera hin) abwenden, und nur
// auf der Seite, von der es kommt.
vec3 sceneRim(vec3 nW, vec3 vW) {
  float edge = 1.0 - clamp(dot(nW, vW), 0.0, 1.0);
  return uSceneRimColor * edge * edge * edge * clamp(0.5 + 0.5 * dot(nW, uSceneRimDir), 0.0, 1.0);
}
#endif
// </scene-light>

void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(vViewPosition);
  float facing = max(dot(n, view), 0.0);
  float rim = pow(1.0 - facing, 2.5);
  // Jedes Teil leuchtet von seiner eigenen Unterkante aus und wird nach oben dunkler.
  float lowerGlow = (1.0 - smoothstep(vGlowRange.x, vGlowRange.y, vPosition.y)) * vGlowRange.z;
  vec3 color = mix(vColor, vGlow, lowerGlow * 0.85);
  color *= 0.62 + 0.38 * facing;
#ifdef SCENE_LIGHT
  vec3 worldNormal = normalize(vWorldNormal);
  color = color * uSceneShade + sceneDiffuse(color, vWorldPos, worldNormal);
#endif
  // Analytische Softbox-Reflexe halten das Jelly auch auf transparentem Desktop glänzend.
  float softbox = exp(-pow((n.x + 0.28) / 0.48, 2.0) - pow((n.y - 0.66) / 0.22, 2.0));
  float sideLight = exp(-pow((n.x + 0.88) / 0.12, 2.0) - pow((n.y - 0.12) / 0.65, 2.0));
  float underLight = pow(max(dot(n, normalize(vec3(0.3, -0.8, 0.4))), 0.0), 14.0);
  color += vec3(0.8, 0.92, 1.0) * softbox * 0.85;
  // Scharfes Glanzlicht oben auf jedem Teil, wie Licht auf einem Fruchtgummi.
  float cap = exp(-pow((n.x + 0.05) / 0.42, 2.0) - pow((n.y - 0.7) / 0.2, 2.0)) * smoothstep(0.0, 0.35, n.z);
  color = mix(color, vec3(0.9, 0.97, 1.0), smoothstep(0.3, 0.8, cap) * 0.6);
  color += vec3(0.65, 0.9, 1.0) * sideLight * 0.6;
  color += vGlow * underLight * 0.55;
  color = mix(color, vColor * 0.22, rim * 0.8);
  color += vGlow * pow(1.0 - facing, 5.0) * 0.28;
#ifdef SCENE_LIGHT
  color += sceneRim(worldNormal, normalize(cameraPosition - vWorldPos));
#endif
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
