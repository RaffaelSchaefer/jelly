// Studio-Glas, Fragment-Shader: Blobs und Popovers als Jelly-Tropfen über dem fertigen Bild.
//
// Läuft als letztes über die ganze Canvas, uBackdrop enthält alles bisher Gezeichnete. Die Flächen
// sind 2D-Signed-Distance-Fields mit weicher Vereinigung, nahe Flächen fließen also ineinander. Aus
// dem Abstand zum Rand wird eine gewölbte Oberfläche, die das Bild dahinter bricht und im selben
// Studio-Licht glänzt wie das Jelly. Am Rand schillert sie wie eine Seifenblase.
//
// Gerechnet wird in CSS-Pixeln mit y nach unten, wie im DOM. Die Normale zeigt mit y nach oben, wie
// in der Szene. MAX_SHAPES, SOLO_SHAPES und SHADOW kommen als #define aus glassMaterial.ts.

uniform sampler2D uBackdrop;
uniform vec2 uBuffer;
uniform vec2 uCanvas;
uniform float uTime;
uniform vec4 uShapes[MAX_SHAPES];
uniform float uCalm[MAX_SHAPES];
uniform vec3 uColor;
uniform vec3 uGlow;
uniform vec3 uInk;

// Ab diesem Abstand in Pixeln beginnen zwei Flächen zu verschmelzen.
const float KNEE = 22.0;
// Wie stark sich eine Fläche verformt, im Verhältnis zu ihrem Radius.
const float WOBBLE = 0.12;
// Namensschild und Fertig-Knopf tragen Text und bewegen sich deshalb kaum. Dasselbe gilt für
// verschmelzende Flächen, die `data-liquid="calm"` tragen, wie den runden Schild-Tropfen (uCalm).
const float SOLO_WOBBLE = 0.04;
// Weiter weg spielt die genaue Form keine Rolle mehr, der Schatten reicht nicht so weit.
const float FAR = 48.0;
// Wie viel Jelly-Farbe in der Mitte und am Rand im Tropfen steckt.
const float BODY_CENTER = 0.32;
const float BODY_EDGE = 0.6;
// Wie stark sich eine lange Fläche auch der Länge nach wölbt. Sonst spiegelt sie das Licht als Strich.
const float BULGE = 0.55;
// Größter Radius einer verschmelzenden Fläche: Die Säule der Schilder bleibt so ein abgerundetes
// Rechteck. Die größte im Studio liegt knapp darunter.
const float BLOB_RADIUS = 40.0;
// Ohne Grenze für den Radius, wie bei der runden Emote-Auswahl.
const float ANY_RADIUS = 1e5;

// Eine Kapsel, die langsam atmet. Liefert den Abstand zum Rand, den Radius und in zw, wie weit die
// Stelle zum Ende einer langen Fläche liegt.
vec4 shapeAt(vec2 p, vec4 shape, float seed, float wobble, float maxRadius) {
  vec2 q = p - shape.xy;
  float full = min(shape.z, shape.w);
  float radius = min(full, maxRadius);
  // Was mehr Radius hätte, als es darf, wölbt sich flacher: Auf der Säule liegt Text.
  float flatter = radius * radius / (full * full);
  float far = max(abs(q.x) - shape.z, abs(q.y) - shape.w);
  if (far > FAR) return vec4(far, radius, 0.0, 0.0);
  // Die Wellen spannen sich über die ganze Fläche: Ein langes Popover wiegt sich, statt zu kräuseln.
  vec2 unit = q / shape.zw;
  float t = uTime * 0.8 + seed * 2.4;
  q += radius * wobble * vec2(
    sin(unit.y * 1.6 + t) + 0.35 * sin(unit.y * 2.7 - t * 1.4),
    sin(unit.x * 1.8 - t * 0.9) + 0.35 * sin(unit.x * 2.9 + t * 1.2)
  );
  vec2 b = abs(q) - shape.zw + radius;
  return vec4(length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - radius, radius, unit * (1.0 - radius / shape.zw) * flatter);
}

// Alle Flächen als eine. Nur die Blobs fließen ineinander. Namensschild und Fertig-Knopf gehören
// nicht dazu, sie bleiben für sich.
vec4 fieldAt(vec2 p) {
  vec4 blobs = vec4(1e5, 1.0, 0.0, 0.0);
  vec4 solo = blobs;
  for (int i = 0; i < MAX_SHAPES; i++) {
    if (uShapes[i].z <= 0.0) continue;
    if (i < SOLO_SHAPES) {
      vec4 alone = shapeAt(p, uShapes[i], float(i), SOLO_WOBBLE, ANY_RADIUS);
      if (alone.x < solo.x) solo = alone;
      continue;
    }
    vec4 next = shapeAt(p, uShapes[i], float(i), mix(WOBBLE, SOLO_WOBBLE, uCalm[i]), BLOB_RADIUS);
    float h = clamp(0.5 + 0.5 * (next.x - blobs.x) / KNEE, 0.0, 1.0);
    blobs = mix(next, blobs, h);
    blobs.x -= KNEE * h * (1.0 - h);
  }
  return solo.x < blobs.x ? solo : blobs;
}

// Richtung, in der der Abstand wächst, also vom Tropfen weg. Nimmt die Steigung ab, wo zwei Flächen
// aufeinandertreffen, läuft die Richtung weich aus. Sonst bliebe an jeder Naht ein Grat.
vec2 outwardAt(vec2 p) {
  const vec2 e = vec2(0.75, 0.0);
  vec2 slope = vec2(fieldAt(p + e.xy).x - fieldAt(p - e.xy).x, fieldAt(p + e.yx).x - fieldAt(p - e.yx).x);
  return slope / max(length(slope), e.x);
}

// Das Studio aus jelly.frag.glsl: Softbox oben links, Streifenlicht rechts, leuchtender Boden.
float softbox(vec3 d, vec3 axis, vec2 size, float soft) {
  float c = dot(d, axis);
  if (c <= 0.0) return 0.0;
  vec3 right = normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, axis);
  vec2 q = abs(vec2(dot(d, right), dot(d, up)) / c) - size;
  return 1.0 - smoothstep(-soft, soft, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
}
vec3 studioLight(vec3 d) {
  vec3 col = uGlow * 0.6 * (1.0 - smoothstep(-0.8, -0.1, d.y));
  col += vec3(14.0) * softbox(d, normalize(vec3(-0.45, 0.8, 0.45)), vec2(0.6, 0.3), 0.15);
  col += vec3(0.7, 0.85, 1.0) * 3.0 * softbox(d, normalize(vec3(1.0, 0.2, -0.25)), vec2(0.1, 0.8), 0.1);
  return col;
}

// Licht der Szene in dieselben Werte wie das fertige Bild in uBackdrop.
vec3 toDisplay(vec3 linear) {
  #ifdef TONE_MAPPING
    linear = toneMapping(linear);
  #endif
  return linearToOutputTexel(vec4(linear, 1.0)).rgb;
}

// Interferenz in einer dünnen Haut wie bei einer Seifenblase. Dicke in Nanometern.
vec3 thinFilm(float facing, float thickness) {
  const float index = 1.33;
  float inside = sqrt(1.0 - (1.0 - facing * facing) / (index * index));
  float path = 2.0 * index * thickness * inside;
  return 0.5 - 0.5 * cos(6.28318 * path / vec3(650.0, 532.0, 450.0));
}

// Das Bild hinter dem Glas. Beim Zoom ragt das Jelly unten aus der Canvas: Es läuft weich aus.
vec4 backdropAt(vec2 uv) {
  return texture2D(uBackdrop, uv) * smoothstep(0.0, 0.2, uv.y);
}

// Eine helle Linie knapp innerhalb des Randes.
float edgeLine(float d) {
  return 1.0 - smoothstep(0.0, 1.8, abs(d + 2.2));
}

// Der Tropfen an dieser Stelle, mit vormultipliziertem Alpha wie das Bild dahinter.
vec4 glassAt(vec2 uv, vec2 p, vec4 field) {
  float d = field.x;
  float radius = field.y;
  vec2 outward = outwardAt(p);
  // Der Querschnitt ist ein Kreisbogen. Eine runde Fläche wird so zur Halbkugel.
  float inset = clamp(-d / radius, 0.0, 1.0);
  vec2 tilt = outward * (1.0 - inset) + field.zw * BULGE;
  vec3 normal = normalize(vec3(tilt.x, -tilt.y, sqrt(1.0 - (1.0 - inset) * (1.0 - inset))));
  float facing = normal.z;
  float rim = length(normal.xy);

  // Wie eine Linse: in der Mitte leicht vergrößert, zum Rand hin stark verzerrt. Jede Farbe wird
  // etwas anders gebrochen, das ist die chromatische Aberration.
  vec2 bend = -normal.xy * radius * (0.28 + 0.55 * rim * rim * rim) / uCanvas;
  float spread = 0.05 + 0.22 * rim * rim;
  vec4 through = backdropAt(uv + bend);
  through.r = backdropAt(uv + bend * (1.0 - spread)).r;
  through.b = backdropAt(uv + bend * (1.0 + spread)).b;

  // Die Farbe des Jellys: oben Grundfarbe, unten das Leuchten.
  float low = smoothstep(-0.9, 0.7, -normal.y);
  vec3 jelly = mix(uColor, uGlow, low * 0.85);
  float body = mix(BODY_EDGE, BODY_CENTER, facing);
  vec3 color = through.rgb * (1.0 - body) + toDisplay(jelly) * body;
  float alpha = through.a * (1.0 - body) + body;

  // Wie beim Jelly dunkelt der äußerste Rand ab, das hält die Form zusammen.
  color = mix(color, toDisplay(uInk), smoothstep(-2.0, -0.2, d) * 0.55);

  float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  vec3 mirrored = toDisplay(studioLight(reflect(vec3(0.0, 0.0, -1.0), normal)) * fresnel);

  // Seifenhaut: schillert zum Rand hin, die Dicke fließt langsam über die Fläche.
  float t = uTime * 0.5;
  float thickness = 520.0 + 190.0 * sin(p.x * 0.05 + t + 1.8 * sin(p.y * 0.045 - t * 0.6));
  vec3 film = thinFilm(facing, thickness) * (0.04 + 0.9 * smoothstep(0.25, 0.95, 1.0 - facing));

  // Am Rand laufen Rot und Grün auseinander.
  float along = dot(outward, vec2(-1.1));
  vec3 fringe = vec3(edgeLine(d + along), edgeLine(d), edgeLine(d - along));
  fringe *= 0.3 + 0.35 * abs(along);

  // Von unten leuchtet der Tropfen von innen, wie das Jelly selbst.
  vec3 inner = toDisplay(uGlow) * low * low * facing * 0.3;

  color = 1.0 - (1.0 - color) * (1.0 - inner) * (1.0 - mirrored) * (1.0 - film) * (1.0 - fringe);
  return vec4(color, max(alpha, max(color.r, max(color.g, color.b))));
}

// Der weiche Schatten, den der Tropfen auf alles darunter wirft.
vec4 shadowed(vec4 behind, vec2 p) {
  float shade = SHADOW * (1.0 - smoothstep(-6.0, 14.0, fieldAt(p - vec2(2.0, 7.0)).x));
  return behind * (1.0 - shade) + vec4(0.0, 0.0, 0.0, shade);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uBuffer;
  vec2 p = vec2(uv.x, 1.0 - uv.y) * uCanvas;
  vec4 field = fieldAt(p);
  vec4 outside = backdropAt(uv);
  if (field.x < FAR) outside = shadowed(outside, p);
  float pixel = uCanvas.x / uBuffer.x;
  float cover = 1.0 - smoothstep(-pixel, pixel, field.x);
  gl_FragColor = cover > 0.0 ? mix(outside, glassAt(uv, p, field), cover) : outside;
}
