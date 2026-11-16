// Jelly-Körper, Fragment-Shader: Körper, Kopf und Hände als ein geraymarchtes Jelly.
//
// Die Teile verschmelzen als Signed Distance Fields mit weicher Vereinigung (smin). Das Leuchten
// innen wird durch das brechende Jelly gesehen, ein Studio spiegelt sich in der Oberfläche, und wo
// es dünn ist, scheint etwas vom Desktop durch. Gesicht und Cosmetics sind normale Meshes darüber.
//
// HEAD_R (Halbachsen des Kopf-Ellipsoids) und MARCH_STEPS kommen als #define aus body.ts, HEAD_R
// abgeleitet von HEAD in jellyGeometry.ts.
//
// Mit JELLY_OPTIMIZED entfällt der Weg durchs Innere, das Studio wird zu festen Glanzlichtern. Form,
// Normalen, Kontur und Tiefe bleiben genau gleich.

uniform mat4 uModel;
uniform mat4 uInvModel;
uniform mat4 uViewProj;
uniform vec3 uCamObj;
uniform vec3 uHead;
uniform vec2 uTilt;
uniform vec4 uHands[2];
uniform vec4 uHandRot[2];
uniform vec3 uHandCurl[2];
uniform vec3 uColor;
uniform vec3 uGlow;
uniform vec3 uInk;
uniform float uPixel;
uniform float uClarity;
varying vec3 vObj;

const float OUTLINE = 0.035;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  return k0 * (k0 - 1.0) / (length(p / (r * r)) + 1e-6);
}
float sdEllipse(vec2 p, vec2 r) {
  float k0 = length(p / r);
  return k0 * (k0 - 1.0) / (length(p / (r * r)) + 1e-6);
}
// Ein Kasten, bei dem nur die unteren Ecken gerundet sind.
float sdFoot(vec2 p, vec2 b, float r) {
  float rr = p.y < 0.0 ? r : 0.0;
  vec2 q = abs(p) - b + rr;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;
}

// Der glockenförmige Körper aus jellyGeometry.ts, um die y-Achse gedreht und 0,8-mal so tief wie
// breit: die obere Hälfte einer Ellipse als Schultern auf einem Fuß mit weicher, flacher Unterseite.
float sdBody(vec3 p) {
  vec2 xz = vec2(p.x, p.z * 1.25);
  float rho = length(xz);
  vec2 q = vec2(rho, p.y);
  // Knapp unter dem Äquator abschneiden, damit sich beide überlappen. Eine gemeinsame Fläche wäre
  // innen als Haut sichtbar.
  float shoulders = max(sdEllipse(q - vec2(0.0, -0.55), vec2(0.86, 0.71)), -0.65 - p.y);
  float foot = sdFoot(q - vec2(0.0, -0.8), vec2(0.86, 0.25), 0.25);
  // Tiefenstreckung zurückrechnen: exakt an der Silhouette, nach vorn eine sichere Unterschätzung.
  float stretch = length(vec2(p.x, p.z * 1.5625)) / max(rho, 1e-4);
  return min(shoulders, foot) / max(stretch, 1.0);
}
float sdHead(vec3 p) {
  vec3 q = p - uHead;
  q.xy = vec2(uTilt.x * q.x + uTilt.y * q.y, uTilt.x * q.y - uTilt.y * q.x);
  return sdEllipsoid(q, HEAD_R);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r;
}
// Dreht v mit der Umkehrung des Quaternions r, also vom Jelly in den Raum einer Hand.
vec3 unrotate(vec3 v, vec4 r) {
  vec3 t = 2.0 * cross(-r.xyz, v);
  return v + r.w * t + cross(-r.xyz, t);
}
// Die rechte Hand mit Grundgröße r: Die drei kurzen Finger zeigen nach +y, die Handfläche nach +z,
// der Daumen sitzt bei -x und zeigt schräg nach oben. Nur die Ansätze verschmelzen mit der
// Handfläche, zwischen den Fingerspitzen zeichnet die Outline Linien. `curl` beugt den Zeigefinger
// (x), die übrigen Finger (y) und den Daumen (z) zur Handfläche, 1 ist eine Faust.
float sdHand(vec3 q, float r, vec3 curl) {
  float palm = sdEllipsoid(q - r * vec3(0.05, -0.15, 0.0), r * vec3(0.9, 0.8, 0.5));
  vec3 thumbTip = mix(vec3(-1.05, 0.25, 0.15), vec3(-0.15, -0.05, 0.55), curl.z);
  float parts = sdCapsule(q, r * vec3(-0.5, -0.3, 0.1), r * thumbTip, 0.26 * r);
  for (int f = 0; f < 3; f++) {
    float x = r * (float(f) * 0.42 - 0.3);
    // Gebeugt kippt der Finger um seinen Ansatz nach vorn über die Handfläche.
    float bend = (f == 0 ? curl.x : curl.y) * 2.4;
    vec3 tip = vec3(x * (1.0 + 0.35 * cos(bend)), r * (0.2 + 0.85 * cos(bend)), r * 0.85 * sin(bend));
    parts = min(parts, sdCapsule(q, vec3(x, 0.2 * r, 0.0), tip, 0.24 * r));
  }
  return smin(palm, parts, 0.2 * r);
}
// Fern der Hände reicht ihre umschließende Kugel. Ab dem Abstand `exact` ändert die genaue Form das
// Ergebnis nicht mehr, spart aber die meiste Rechnung im Raymarch.
float sdHands(vec3 p, float exact) {
  float d = 1e5;
  for (int i = 0; i < 2; i++) {
    float r = uHands[i].w;
    if (r <= 0.0) continue;
    vec3 q = p - uHands[i].xyz;
    float bound = length(q) - 1.6 * r;
    if (bound > exact) {
      d = min(d, bound);
      continue;
    }
    q = unrotate(q, uHandRot[i]);
    // Die linke Hand ist das Spiegelbild der rechten, ihr Daumen sitzt bei +x.
    q.x *= float(i) * 2.0 - 1.0;
    d = min(d, sdHand(q, r, uHandCurl[i]));
  }
  return d;
}
float map(vec3 p) {
  // Genau bis zum Radius von smin, weiter weg verschmilzt nichts mehr.
  return smin(smin(sdBody(p), sdHead(p), 0.15), sdHands(p, 0.1), 0.1);
}
vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}
// Wo zwei Teile aufeinandertreffen, sind beide nah: am Hals oder wo eine Hand aus dem Körper kommt.
float crease(vec3 p) {
  float b = sdBody(p), h = sdHead(p), k = sdHands(p, 0.28);
  return 1.0 - smoothstep(0.0, 0.28, min(max(b, h), min(max(b, k), max(h, k))));
}

// Der Boden und der dunkle Raum darüber, in beiden Varianten gleich.
vec3 room(vec3 d) {
  vec3 col = mix(uColor * 0.08, vec3(0.06, 0.08, 0.1), smoothstep(-0.4, 0.5, d.y));
  return col + uGlow * 0.6 * (1.0 - smoothstep(-0.8, -0.1, d.y));
}

#ifdef JELLY_OPTIMIZED

// Die zwei Lichter des Studios als einfache runde Flecken, ohne Softbox-Rechnung.
const vec3 KEY_LIGHT = normalize(vec3(-0.45, 0.8, 0.45));
const vec3 STRIP_LIGHT = normalize(vec3(1.0, 0.2, -0.25));
vec3 env(vec3 d) {
  vec3 col = room(d);
  col += vec3(14.0) * smoothstep(0.87, 0.95, dot(d, KEY_LIGHT));
  col += vec3(0.7, 0.85, 1.0) * 3.0 * smoothstep(0.95, 0.99, dot(d, STRIP_LIGHT));
  return col;
}

#else

const float IOR = 1.33;

// Ein weiches Studio rundherum: Softbox oben links, Streifenlicht rechts, leuchtender Boden.
float softbox(vec3 d, vec3 axis, vec2 size, float soft) {
  float c = dot(d, axis);
  if (c <= 0.0) return 0.0;
  vec3 right = normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, axis);
  vec2 q = abs(vec2(dot(d, right), dot(d, up)) / c) - size;
  return 1.0 - smoothstep(-soft, soft, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
}
vec3 env(vec3 d) {
  vec3 col = room(d);
  col += vec3(14.0) * softbox(d, normalize(vec3(-0.45, 0.8, 0.45)), vec2(0.6, 0.3), 0.15);
  col += vec3(0.7, 0.85, 1.0) * 3.0 * softbox(d, normalize(vec3(1.0, 0.2, -0.25)), vec2(0.1, 0.8), 0.1);
  return col;
}

#endif

// Kopf und Körper leuchten jeweils von ihrer eigenen Unterkante aus und werden nach oben dunkler.
float glowAt(vec3 p) {
  float head = smoothstep(-0.18, 0.18, sdBody(p) - sdHead(p));
  float y = mix((p.y + 1.05) / 1.1, (p.y - uHead.y + 0.56) / 0.95, head);
  return 1.0 - smoothstep(0.0, 1.0, y);
}

void main() {
  vec3 rd = normalize(vObj - uCamObj);
  vec3 ro = vObj;
  float t = 0.0, minD = 1e5, tMin = 0.0;
  bool hit = false;
  for (int i = 0; i < MARCH_STEPS; i++) {
    float d = map(ro + rd * t);
    if (d < minD) { minD = d; tMin = t; }
    if (d < 0.0005) { hit = true; break; }
    t += d;
    if (t > 4.0) break;
  }

  vec3 color;
  float alpha;
  vec3 surface;
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 nW = normalize(n * mat3(uInvModel));
    vec3 vW = normalize(mat3(uModel) * rd);
    float ndv = clamp(-dot(nW, vW), 0.0, 1.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);

#ifdef JELLY_OPTIMIZED
    // Ohne Weg durchs Innere steht der Blickwinkel für die Dicke: Flach getroffen ist es dünn.
    float thick = smoothstep(0.0, 0.75, ndv);
    vec3 jelly = mix(uColor, uGlow, glowAt(p) * 0.85);
    jelly *= mix(1.12, 0.82, thick);
    alpha = 1.0 - uClarity * (1.0 - thick) * (1.0 - fresnel);
#else
    // Hineinbrechen und das Jelly bis zur Rückwand durchqueren. s ist die Dicke entlang des Wegs.
    vec3 inside = refract(rd, n, 1.0 / IOR);
    float s = 0.02;
    vec3 q = p + inside * s;
    for (int i = 0; i < 40; i++) {
      float d = map(q);
      if (d > -0.001) break;
      s += max(-d, 0.02);
      q = p + inside * s;
    }
    // Das Leuchten sieht man teils an der Oberfläche, teils an der Rückwand durch das Jelly hindurch,
    // verschoben durch die Brechung. Dieser Versatz lässt es wie einen dicken, klaren Körper wirken.
    float glow = mix(glowAt(p), glowAt(q), 0.6);
    vec3 jelly = mix(uColor, uGlow, glow * 0.85);
    jelly *= mix(1.12, 0.82, smoothstep(0.2, 1.3, s));
    alpha = 1.0 - uClarity * (1.0 - smoothstep(0.15, 1.1, s)) * (1.0 - fresnel);
#endif
    jelly *= 0.62 + 0.38 * ndv;
    float ao = 1.0 - 0.5 * crease(p);
    color = jelly * ao + env(reflect(vW, nW)) * fresnel * ao;
    color = mix(color, uColor * 0.22, pow(1.0 - ndv, 2.5) * 0.7);
    // Tinte, wo sich die Oberfläche abwendet: der Toon-Rand und Kantenglättung zur Outline.
    float ink = 1.0 - smoothstep(0.0, 0.14, ndv);
    color = mix(color, uInk, ink);
    alpha = mix(alpha, 1.0, ink);
    surface = p;
  } else {
    // Strahlen, die knapp vorbeigehen, zeichnen die Outline um die ganze Silhouette.
    surface = ro + rd * tMin;
    float px = uPixel * distance(surface, uCamObj);
    alpha = 1.0 - smoothstep(OUTLINE - px, OUTLINE + px, minD);
    if (alpha <= 0.0) discard;
    color = uInk;
  }
  vec4 clip = uViewProj * uModel * vec4(surface, 1.0);
  gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
