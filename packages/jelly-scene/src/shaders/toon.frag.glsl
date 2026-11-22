// Toon-Shader, Fragment-Teil: glänzendes Fruchtgummi-Material für Cosmetics.
// vGlowRange ist der y-Bereich des Teils, von unten (volles Leuchten) nach oben (Grundfarbe), und
// in z, wie stark es leuchtet. vFluff macht ein Teil zu Plüsch: ohne Glanz, mit Fell und hellem Rand.
// vGlass lässt von vorn durchscheinen, was dahinter liegt (Mischen in cosmetic.ts).
// vNeon lässt ein Teil selbst leuchten: ohne Schatten, auch im Dunkel einer Szene.
// Mit SCENE_LIGHT kommt das Licht einer Szene dazu (Block <scene-light>).

varying vec3 vColor;
varying vec3 vGlow;
varying vec3 vGlowRange;
varying float vFluff;
varying float vGlass;
varying float vNeon;
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

// Wertrauschen fest am Modell, für die Büschel und die Körnung des Plüschs.
float fluffHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float fluffNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(fluffHash(i), fluffHash(i + vec3(1.0, 0.0, 0.0)), u.x);
  float b = mix(fluffHash(i + vec3(0.0, 1.0, 0.0)), fluffHash(i + vec3(1.0, 1.0, 0.0)), u.x);
  float c = mix(fluffHash(i + vec3(0.0, 0.0, 1.0)), fluffHash(i + vec3(1.0, 0.0, 1.0)), u.x);
  float d = mix(fluffHash(i + vec3(0.0, 1.0, 1.0)), fluffHash(i + vec3(1.0, 1.0, 1.0)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

// Plüsch: Büschel heben und senken die Farbe, dazu feine Körnung wie Fell, die verblasst, sobald sie
// feiner als ein Pixel würde. Wo sich der Plüsch abwendet, leuchtet er hell und flaumig.
vec3 plush(vec3 color, float facing) {
  float clumps = fluffNoise(vPosition * 9.0 + 17.0);
  float grain = fluffNoise(vPosition * 34.0) - 0.5;
  float sharp = clamp(1.6 - length(fwidth(vPosition)) * 34.0, 0.0, 1.0);
  vec3 fur = color * (0.88 + 0.24 * clumps) * (1.0 + grain * 0.3 * sharp);
  return fur + mix(vColor, vec3(1.0), 0.6) * pow(1.0 - facing, 1.6) * 0.5;
}

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
  // Analytische Softbox-Reflexe halten das Jelly auch auf transparentem Desktop glänzend. Plüsch
  // glänzt nicht.
  float gloss = 1.0 - vFluff;
  float softbox = exp(-pow((n.x + 0.28) / 0.48, 2.0) - pow((n.y - 0.66) / 0.22, 2.0));
  float sideLight = exp(-pow((n.x + 0.88) / 0.12, 2.0) - pow((n.y - 0.12) / 0.65, 2.0));
  float underLight = pow(max(dot(n, normalize(vec3(0.3, -0.8, 0.4))), 0.0), 14.0);
  color += vec3(0.8, 0.92, 1.0) * softbox * 0.85 * gloss;
  // Scharfes Glanzlicht oben auf jedem Teil, wie Licht auf einem Fruchtgummi.
  float cap = exp(-pow((n.x + 0.05) / 0.42, 2.0) - pow((n.y - 0.7) / 0.2, 2.0)) * smoothstep(0.0, 0.35, n.z);
  color = mix(color, vec3(0.9, 0.97, 1.0), smoothstep(0.3, 0.8, cap) * 0.6 * gloss);
  color += vec3(0.65, 0.9, 1.0) * sideLight * 0.6 * gloss;
  color += vGlow * underLight * 0.55 * gloss;
  color = mix(color, vColor * 0.22, rim * 0.8 * gloss);
  color += vGlow * pow(1.0 - facing, 5.0) * 0.28;
  color = mix(color, plush(color, facing), vFluff);
#ifdef SCENE_LIGHT
  color += sceneRim(worldNormal, normalize(cameraPosition - vWorldPos));
#endif
  // Glas deckt zum Rand hin mehr, dort blickt man schräg durch mehr davon.
  gl_FragColor = vec4(color, 1.0 - vGlass * facing);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Neon leuchtet selbst: Schatten, Glanz und das Dunkel der Szene gelten nicht. Wo es zur Kamera
  // blickt, glüht es heller, je heller seine Farbe ist, an seinem runden Rand bleibt die satte Farbe.
  // Es umgeht auch das Tonemapping, das satte helle Farben zu Pastell bleicht.
  float hot = pow(facing, 4.0);
  vec3 neon = vColor * (1.0 + 0.3 * hot) + dot(vColor, vec3(0.2126, 0.7152, 0.0722)) * 0.25 * hot;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(neon, 1.0)).rgb, vNeon);
}
