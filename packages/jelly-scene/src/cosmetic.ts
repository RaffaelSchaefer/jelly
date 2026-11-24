/**
 * Cosmetics laden und zeichnen. App, Karte und Beamer zeigen damit dieselben Modelle.
 *
 * Die Modelle entstehen in `apps/client/blender/cosmetics.blend`. Ein neues Modell braucht hier
 * eine Import-Zeile: esbuild, das die Bühne des Servers baut, kennt kein `import.meta.glob`.
 *
 * @module
 */

import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Mesh,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector4,
  type MeshStandardMaterial,
  type Vector3,
  type WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { waveUniforms, type CosmeticPulse, type CosmeticWave } from "./cosmeticPulse.ts";
import bandana from "./cosmetics/bandana.glb?url&inline";
import batWings from "./cosmetics/bat-wings.glb?url&inline";
import beanie from "./cosmetics/beanie.glb?url&inline";
import bellCollar from "./cosmetics/bell-collar.glb?url&inline";
import bfg from "./cosmetics/bfg.glb?url&inline";
import catEars from "./cosmetics/cat-ears.glb?url&inline";
import catPaws from "./cosmetics/cat-paws.glb?url&inline";
import catTail from "./cosmetics/cat-tail.glb?url&inline";
import catWhiskers from "./cosmetics/cat-whiskers.glb?url&inline";
import chicken from "./cosmetics/chicken.glb?url&inline";
import crown from "./cosmetics/crown.glb?url&inline";
import cyberCatEars from "./cosmetics/cyber-cat-ears.glb?url&inline";
import fairyWings from "./cosmetics/fairy-wings.glb?url&inline";
import goldenCup from "./cosmetics/golden-cup.glb?url&inline";
import goose from "./cosmetics/goose.glb?url&inline";
import headsetNeutral from "./cosmetics/headset-neutral.glb?url&inline";
import headset from "./cosmetics/headset.glb?url&inline";
import hollowHelmet from "./cosmetics/hollow-helmet.glb?url&inline";
import hood from "./cosmetics/hood.glb?url&inline";
import kaminaGlasses from "./cosmetics/kamina-glasses.glb?url&inline";
import kiteShield from "./cosmetics/kite-shield.glb?url&inline";
import kitten from "./cosmetics/kitten.glb?url&inline";
import knitScarf from "./cosmetics/knit-scarf.glb?url&inline";
import longSchnoerbi from "./cosmetics/long-schnoerbi.glb?url&inline";
import miniBackpack from "./cosmetics/mini-backpack.glb?url&inline";
import nailSword from "./cosmetics/nail-sword.glb?url&inline";
import nasalHelmet from "./cosmetics/nasal-helmet.glb?url&inline";
import octopus from "./cosmetics/octopus.glb?url&inline";
import ogreEars from "./cosmetics/ogre-ears.glb?url&inline";
import partyHat from "./cosmetics/party-hat.glb?url&inline";
import piercings from "./cosmetics/piercings.glb?url&inline";
import pixelGlasses from "./cosmetics/pixel-glasses.glb?url&inline";
import schnoerbiMask from "./cosmetics/schnoerbi-mask.glb?url&inline";
import snailShell from "./cosmetics/snail-shell.glb?url&inline";
import sprout from "./cosmetics/sprout.glb?url&inline";
import wizardHat from "./cosmetics/wizard-hat.glb?url&inline";
import yarnBall from "./cosmetics/yarn-ball.glb?url&inline";
import outlineFragmentShader from "./shaders/outline.frag.glsl?raw";
import outlineVertexShader from "./shaders/outline.vert.glsl?raw";
import fragmentShader from "./shaders/toon.frag.glsl?raw";
import vertexShader from "./shaders/toon.vert.glsl?raw";

/**
 * Modelle als Data-URL nach Schlüssel. Sie liegen im Bundle, denn `connect-src` der App verbietet
 * der Oberfläche `fetch`, auch auf eigene Dateien. `tauri dev` zeigt das nicht: Dort kommt die
 * Seite direkt von Vite, ohne CSP. Erst das gebaute Binary würde das Modell still weglassen.
 */
// ponytail: Alle Modelle liegen im Chunk der Szene. Dynamische Importe trennten sie, falls sie groß
// werden. `?inline` allein geht nicht, Vite kennt `.glb` nicht als Asset.
export const COSMETIC_MODELS: Readonly<Record<string, string>> = {
  bandana,
  "bat-wings": batWings,
  beanie,
  "bell-collar": bellCollar,
  bfg,
  "cat-ears": catEars,
  "cat-paws": catPaws,
  "cat-tail": catTail,
  "cat-whiskers": catWhiskers,
  chicken,
  crown,
  "cyber-cat-ears": cyberCatEars,
  "fairy-wings": fairyWings,
  "golden-cup": goldenCup,
  goose,
  headset,
  "headset-neutral": headsetNeutral,
  "hollow-helmet": hollowHelmet,
  hood,
  "kamina-glasses": kaminaGlasses,
  "kite-shield": kiteShield,
  kitten,
  "knit-scarf": knitScarf,
  "long-schnoerbi": longSchnoerbi,
  "mini-backpack": miniBackpack,
  "nail-sword": nailSword,
  "nasal-helmet": nasalHelmet,
  octopus,
  "ogre-ears": ogreEars,
  "party-hat": partyHat,
  piercings,
  "pixel-glasses": pixelGlasses,
  "schnoerbi-mask": schnoerbiMask,
  "snail-shell": snailShell,
  sprout,
  "wizard-hat": wizardHat,
  "yarn-ball": yarnBall,
};

/** Breite der Outline in Szenen-Einheiten. */
export const COSMETIC_OUTLINE = 0.035;

/**
 * Abweichende Looks je Schlüssel. Piercings und Schnurrhaare sind kaum dicker als die Outline, mit
 * ihr läge um jedes Teil ein dunkler Fleck wie ein Schatten. Katzenohren und -schwanz liegen hinter
 * dem Jelly: Die Ohren wachsen so hinter dem Kopf hervor, der Schwanz steht nicht vor den Händen.
 * Die BFG ebenso, dort entscheidet die echte Tiefe: Die Hand liegt vor dem Griff, das hintere Ende
 * verschwindet im Jelly. Solange das Jelly sie hält, zeichnet die App auch, was es am Körper trägt,
 * dahinter (`WornCosmetics` in `Character.tsx`), sonst malten sich etwa Flügel über die BFG. Der
 * Oktopus sitzt schräg oben am Kopf und wackelt um seinen Sitz, so bleibt er dort: gestaucht
 * entlang seiner eigenen Höhe, die wie in `build_octopus.py` um `TILT` geneigt ist. Seine Arme
 * wedeln ab dem Rand seines Kopfes, dessen Mitte und Radius ebenfalls von dort stammen.
 */
const COSMETIC_LOOKS: Readonly<Record<string, CosmeticLook>> = {
  bfg: { behind: true },
  "cat-ears": { behind: true },
  "cyber-cat-ears": { behind: true },
  "cat-tail": { behind: true },
  "cat-whiskers": { outline: 0.014 },
  octopus: {
    pulse: { at: [0.36, 1.17, 0.25], amount: 0.24, rate: 1.6, rock: 0.3, lean: -0.61 },
    wave: { at: [0.45, 1.31, 0.36], from: 0.2, span: 0.26, amount: 0.15, rate: 2.1 },
  },
  piercings: { outline: 0.014 },
};

/** Wie das Cosmetic `key` gezeichnet wird, für {@link createCosmetic}. */
export function cosmeticLook(key: string): CosmeticLook {
  return COSMETIC_LOOKS[key] ?? {};
}

/** Zeichenebene der untersten Malschicht: über dem Gesicht (6–7), die Outline vor der Füllung. */
const OUTLINE_ORDER = 8;
const FILL_ORDER = 9;

/**
 * So weit rückt die Tiefe im Modus `depth` zur Kamera, in Einheiten des Jellys. Die Bühne blickt
 * von oben, ohne den Versatz verdeckte der Kopf das Mikro und die Outline dort, wo das Cosmetic
 * anliegt. Durch den ganzen Kopf reicht er nicht, von hinten scheint also nichts durch.
 */
const DEPTH_BIAS = 0.2;

/** Zeichenebene eines Stickers hinter dem Jelly: vor dem Gesicht (6–7) und allen Malschichten. */
const BEHIND_ORDER = { outline: 1, fill: 2 };

/**
 * Wie ein Cosmetic zu dem steht, was schon gezeichnet ist.
 *
 * - `sticker`: Es löscht vorher die Tiefe und liegt obenauf. Für die App, wo nichts davor steht.
 * - `depth`: Normaler Tiefentest, für die Bühne. Dort stünde ein Jelly sonst vor dem Sofa, das vor
 *   ihm steht.
 */
export type CosmeticMode = "sticker" | "depth";

/**
 * Wie ein Cosmetic gezeichnet wird. Ohne Angaben zeichnet es wie jedes Cosmetic im Katalog.
 *
 * Als Sticker deckt eine höhere Malschicht alle darunter ganz ab, mit eigenem Tintenrand: Jede
 * Outline löscht vorher die Tiefe, Teile derselben Schicht verdecken einander noch nach ihrer
 * Tiefe. So bekommt der Zauberer Innenlinien, wo Schnurrbart über Bart oder Hutband über Filz
 * liegt.
 */
export interface CosmeticLook {
  /** Malschicht 0 bis 4. Ohne Angabe 0. */
  layer?: number;
  /** Breite der Outline in Szenen-Einheiten. Ohne Angabe {@link COSMETIC_OUTLINE}. */
  outline?: number;
  /**
   * Die Farbe, die der Träger gewählt hat, als Hex-Text. Sie färbt nur Teile mit `tint` aus
   * Blender, ohne Farbe bleibt das Cosmetic, wie es modelliert ist.
   */
  tint?: string | null;
  /**
   * Als Sticker hinter dem Jelly statt obenauf: Es löscht die Tiefe nicht, Körper und Hände
   * verdecken es also. Für Teile, die hinter dem Körper hervorkommen und vor denen die Hände
   * stehen.
   */
  behind?: boolean;
  /** Ob und wie es pulsiert. Das Anschwellen übernimmt `pulseCosmetics` je Bild. */
  pulse?: CosmeticPulse;
  /** Ob und wie seine Arme wedeln. Den Takt gibt ebenfalls `pulseCosmetics`. */
  wave?: CosmeticWave;
}

/**
 * Zeichenreihenfolge von Outline und Füllung in der Malschicht `layer`. Alles in 3D, das über einem
 * Sticker der Schicht 4 liegen soll, braucht eine höhere `renderOrder`.
 */
export function stickerOrder(layer = 0) {
  return { outline: OUTLINE_ORDER + 2 * layer, fill: FILL_ORDER + 2 * layer };
}

/**
 * Die Reihenfolge eines Cosmetics mit Glas: zuletzt in seiner Malschicht, erst die Füllung, dann
 * die Outline. Die Füllung lässt durchscheinen, was schon gezeichnet ist, und schreibt Tiefe, so
 * bleibt die Outline hinter dem Glas verborgen und zeigt sich nur außen. Zuerst gezeichnet, schiene
 * ihre Tinte durch das Glas.
 */
// ponytail: Glas mischt nur mit dem, was vor ihm gezeichnet ist. Auf der Bühne scheint ein Jelly
// dahinter, das erst danach drankommt, nicht durch. Abhilfe wäre ein eigener Durchgang für Glas
// nach allem anderen.
function glassOrder(layer = 0) {
  const { fill } = stickerOrder(layer);
  return { fill: fill + 1 / 3, outline: fill + 2 / 3 };
}

/**
 * Wie Glas sich mischt: die Farbe nach ihrem Alpha, und Alpha für den durchsichtigen Hintergrund
 * des Fensters. `transparent` bleibt aus, sonst zeichnete three.js das Glas erst nach allen
 * Malschichten.
 */
const GLASS_BLENDING = {
  blending: CustomBlending,
  blendSrc: SrcAlphaFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneMinusSrcAlphaFactor,
} as const;

/** Die Data-URL des Modells `key`, falls es eins gibt. Schlüssel kommen vom Server. */
function findModelUrl(key: string) {
  return Object.hasOwn(COSMETIC_MODELS, key) ? COSMETIC_MODELS[key] : undefined;
}

/** Ob es für das Cosmetic schon ein Modell gibt. */
export function hasCosmeticModel(key: string) {
  return findModelUrl(key) !== undefined;
}

/** Liest eine Data-URL. `GLTFLoader.load` holte sie per `fetch`. */
function decodeDataUrl(url: string) {
  const base64 = url.slice(url.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;
}

/**
 * Wie stark ein Teil von unten leuchtet, 0 bis 1. Ein Material kann es in Blender mit der
 * Eigenschaft `glow` dämpfen, die als glTF-`extras` ankommt: Das Leuchten mischt bis zu 38 % Weiß
 * hinein, im linearen Farbraum, und dunkle Farben wirken unten dadurch fast grau.
 */
function glowOf(material: MeshStandardMaterial) {
  const glow: unknown = material.userData.glow;
  return typeof glow === "number" ? Math.min(1, Math.max(0, glow)) : 1;
}

/**
 * Wie flauschig ein Teil ist, 0 bis 1: die Eigenschaft `fluff` des Materials aus Blender. Plüsch
 * glänzt nicht wie Fruchtgummi, er zeigt Fellkörnung und einen hellen, flaumigen Rand.
 */
function fluffOf(material: MeshStandardMaterial) {
  const fluff: unknown = material.userData.fluff;
  return typeof fluff === "number" ? Math.min(1, Math.max(0, fluff)) : 0;
}

/**
 * Wie ein Teil die Farbe des Trägers annimmt, -2 bis 2: die Eigenschaft `tint` des Materials aus
 * Blender. 0 heißt eigene Farbe, 1 genau die gewählte, darunter dunkler, darüber zu Weiß hin.
 * Negativ gilt dasselbe für ihre Gegenfarbe, wie bei der Iris des Oktopus.
 */
function tintOf(material: MeshStandardMaterial) {
  const tint: unknown = material.userData.tint;
  return typeof tint === "number" ? Math.min(2, Math.max(-2, tint)) : 0;
}

/**
 * Wie durchsichtig ein Teil ist, 0 bis 1: die Eigenschaft `glass` des Materials aus Blender. 0 ist
 * deckend, mit mehr scheint von vorn durch, was dahinter liegt. Zum Rand hin deckt Glas mehr.
 */
function glassOf(material: MeshStandardMaterial) {
  const glass: unknown = material.userData.glass;
  return typeof glass === "number" ? Math.min(1, Math.max(0, glass)) : 0;
}

/**
 * Wie stark ein Teil selbst leuchtet, 0 bis 1: die Eigenschaft `neon` des Materials aus Blender.
 * Neon kennt keinen Schatten und bleibt hell, auch wenn die Szene abdunkelt.
 */
function neonOf(material: MeshStandardMaterial) {
  const neon: unknown = material.userData.neon;
  return typeof neon === "number" ? Math.min(1, Math.max(0, neon)) : 0;
}

/** Dieselben `values` für jeden der `count` Vertices, als ein Attribut. */
function repeated(values: number[], count: number) {
  const size = values.length;
  const array = Float32Array.from(
    { length: count * size },
    (_, index) => values[index % size] ?? 0,
  );
  return new BufferAttribute(array, size);
}

/**
 * Ein Mesh aus der glTF-Datei in Koordinaten des Jellys, mit Farbe, y-Bereich und Stärke des
 * Leuchtens sowie Flausch, Einfärbung, Glas und Neon je Vertex.
 */
function createPart(mesh: Mesh) {
  const source = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  source.computeBoundingBox();
  const { min, max } = source.boundingBox!;
  const material = (
    Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  ) as MeshStandardMaterial;
  const { color } = material;
  const count = source.getAttribute("position").count;
  // Nur was der Shader liest: Mit weiteren Attributen scheiterte das Zusammenfassen an Unterschieden.
  const part = new BufferGeometry();
  part.setAttribute("position", source.getAttribute("position"));
  part.setAttribute("normal", source.getAttribute("normal"));
  part.setAttribute("aColor", repeated([color.r, color.g, color.b], count));
  part.setAttribute("aGlowRange", repeated([min.y, max.y, glowOf(material)], count));
  part.setAttribute("aFluff", repeated([fluffOf(material)], count));
  part.setAttribute("aTint", repeated([tintOf(material)], count));
  part.setAttribute("aGlass", repeated([glassOf(material)], count));
  part.setAttribute("aNeon", repeated([neonOf(material)], count));
  part.setIndex(source.getIndex());
  return part;
}

/** Fasst Teile zu einer Geometrie zusammen: zwei Draw-Calls je Träger statt zwei je Teil. */
function mergeAll(parts: BufferGeometry[]) {
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error("Cosmetic: Die Teile passen nicht zusammen");
  return merged;
}

/** Fasst alle Meshes zu einer Geometrie zusammen. */
function mergeParts(scene: Object3D) {
  scene.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  scene.traverse((object) => {
    if (object instanceof Mesh) parts.push(createPart(object));
  });
  return mergeAll(parts);
}

/**
 * Zu welchem Teil ein Mesh gehört: seine Eigenschaft `part` aus Blender, die als glTF-`extras`
 * ankommt, sonst die seines Elternknotens. Ein Objekt mit mehreren Materialien wird zu einem Knoten
 * mit einem Mesh je Material, die `extras` stehen dann am Knoten.
 */
function partOf(mesh: Mesh) {
  const part: unknown = mesh.userData.part ?? mesh.parent?.userData.part;
  return typeof part === "string" ? part : null;
}

/** Fasst die Meshes je Teil zu einer Geometrie zusammen. Meshes ohne Teil bleiben weg. */
function mergePartsByName(scene: Object3D): ReadonlyMap<string, BufferGeometry> {
  scene.updateMatrixWorld(true);
  const groups = new Map<string, BufferGeometry[]>();
  scene.traverse((object) => {
    const part = object instanceof Mesh ? partOf(object) : null;
    if (part !== null) groups.set(part, [...(groups.get(part) ?? []), createPart(object as Mesh)]);
  });
  return new Map(Array.from(groups, ([part, group]) => [part, mergeAll(group)]));
}

/** Liest ein Modell aus seiner Data-URL. */
async function parseModel(url: string) {
  const { scene } = await new GLTFLoader().parseAsync(decodeDataUrl(url), "");
  return scene;
}

/** Bereits geladene Modelle je Data-URL. Alle Jellies teilen sie, darum werden sie nie freigegeben. */
const LOADED = new Map<string, Promise<BufferGeometry>>();

/** Bereits nach Teilen zerlegte Modelle je Data-URL, ebenso geteilt. */
const LOADED_PARTS = new Map<string, Promise<ReadonlyMap<string, BufferGeometry>>>();

/** Für Schlüssel ohne Modell: immer dasselbe Promise, so wartet React nicht jedes Mal neu. */
const NO_MODEL = Promise.resolve(null);

/**
 * Lädt ein Modell aus seiner Data-URL als eine Geometrie. Für dieselbe URL kommt immer dasselbe
 * Promise. Für Modelle außerhalb von {@link COSMETIC_MODELS}.
 */
export function loadModel(url: string) {
  const known = LOADED.get(url);
  if (known) return known;
  const loading = parseModel(url).then(mergeParts);
  LOADED.set(url, loading);
  return loading;
}

/**
 * Lädt ein Modell aus seiner Data-URL als eine Geometrie je Teil, benannt nach der Eigenschaft
 * `part` der Objekte in Blender. Für dieselbe URL kommt immer dasselbe Promise. So kommen alle
 * Teile des Zauberers aus einer Datei, und jedes liegt doch in seiner eigenen Malschicht.
 */
export function loadModelParts(url: string): Promise<ReadonlyMap<string, BufferGeometry>> {
  const known = LOADED_PARTS.get(url);
  if (known) return known;
  const loading = parseModel(url).then(mergePartsByName);
  LOADED_PARTS.set(url, loading);
  return loading;
}

/**
 * Lädt das Modell `key` als eine Geometrie, ohne Modell ist das Ergebnis `null`. Für denselben
 * Schlüssel kommt immer dasselbe Promise, so kann React darauf warten.
 */
export function loadCosmetic(key: string): Promise<BufferGeometry | null> {
  const url = findModelUrl(key);
  return url ? loadModel(url) : NO_MODEL;
}

/** Die Farbe des Trägers für den Shader: linear, `w` = 1, wenn es eine gibt. */
function tintUniform(tint: string | null | undefined) {
  if (!tint) return new Vector4(0, 0, 0, 0);
  const { r, g, b } = new Color(tint);
  return new Vector4(r, g, b, 1);
}

/** Ob ein Teil des Modells aus Glas ist. */
function hasGlass(model: BufferGeometry) {
  const glass = model.getAttribute("aGlass") as BufferAttribute | undefined;
  return glass !== undefined && (glass.array as Float32Array).some((value) => value > 0);
}

/** Löscht die Tiefe: Was danach kommt, liegt auf allem, was schon gezeichnet ist. */
function clearDepth(renderer: WebGLRenderer) {
  renderer.clearDepth();
}

/**
 * Die Outline von `model`: entlang der Normalen um `width` geweitet und von hinten gezeichnet, so
 * bleibt ein Rand in `ink` um die Füllung. Sie schreibt keine Tiefe: Sonst läge ihr Rand über
 * Teilen dahinter, wie eine Innenlinie.
 */
function createOutline(
  model: BufferGeometry,
  ink: string,
  width: number,
  shared: Record<string, { value: unknown }>,
) {
  return new Mesh(
    model,
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uWidth: { value: width },
        uInk: { value: new Color(ink) },
        ...shared,
      },
      vertexShader: outlineVertexShader,
      fragmentShader: outlineFragmentShader,
    }),
  );
}

/**
 * Die Outline eines Stickers in der Malschicht `layer`, für Teile mit eigener Füllung wie die
 * Kristallkugel. Sie löscht vorher die Tiefe wie die Outline jedes Cosmetics als Sticker.
 */
export function createStickerOutline(model: BufferGeometry, ink: string, width: number, layer = 0) {
  const outline = createOutline(model, ink, width, { uDepthBias: { value: 0 }, ...waveUniforms() });
  outline.renderOrder = stickerOrder(layer).outline;
  outline.onBeforeRender = clearDepth;
  return outline;
}

/** Merkt sich am Cosmetic, wie es pulsiert und wedelt, für `pulseCosmetics`. */
function rememberMotion(cosmetic: Object3D, look: CosmeticLook, move: Vector3) {
  if (look.pulse) cosmetic.userData.pulse = look.pulse;
  if (look.wave) cosmetic.userData.wave = { ...look.wave, move };
}

/**
 * Ein Cosmetic in der Tintenfarbe `ink`, in Koordinaten des Jellys. Für Kopf und Gesicht gehört es
 * in `Jelly.faceAnchor`. `Object3D` statt `Group`, damit die Bühne das Jelly weiter als Ganzes
 * sortiert. Das Material gehört ihm, `disposeJelly` oder {@link disposeCosmetic} geben es frei. Mit
 * Glas zeichnet es zuletzt in seiner Malschicht (siehe {@link glassOrder}).
 *
 * @param look - Malschicht, Strichstärke und Farbe. Ohne Angabe zeichnet es wie modelliert.
 */
export function createCosmetic(
  model: BufferGeometry,
  ink: string,
  mode: CosmeticMode,
  look: CosmeticLook = {},
) {
  const glass = hasGlass(model);
  const behind = mode === "sticker" && look.behind === true;
  const layered = glass ? glassOrder(look.layer) : stickerOrder(look.layer);
  const order = behind ? BEHIND_ORDER : layered;
  const uDepthBias = { value: mode === "depth" ? DEPTH_BIAS : 0 };
  const wave = waveUniforms(look.wave);
  const shared = { uDepthBias, ...wave };
  const outline = createOutline(model, ink, look.outline ?? COSMETIC_OUTLINE, shared);
  outline.renderOrder = order.outline;
  const fill = new Mesh(
    model,
    new ShaderMaterial({
      uniforms: { ...shared, uTint: { value: tintUniform(look.tint) } },
      vertexShader,
      fragmentShader,
      ...(glass ? GLASS_BLENDING : {}),
    }),
  );
  // Eine Szene mit eigenem Licht, wie die des Shops, erkennt daran, was sie beleuchten darf.
  fill.material.userData.lightable = true;
  fill.renderOrder = order.fill;
  // Als Sticker löscht, was zuerst zeichnet, die Tiefe: sonst die Outline, mit Glas die Füllung.
  if (mode === "sticker" && !behind) (glass ? fill : outline).onBeforeRender = clearDepth;
  const cosmetic = new Object3D();
  cosmetic.add(outline, fill);
  rememberMotion(cosmetic, look, wave.uWaveMove.value);
  return cosmetic;
}

/** Gibt die Materialien eines Cosmetics frei. Das Modell teilen sich alle Jellies und es bleibt. */
export function disposeCosmetic(cosmetic: Object3D) {
  cosmetic.traverse((object) => {
    if (object instanceof Mesh) (object.material as ShaderMaterial).dispose();
  });
}
