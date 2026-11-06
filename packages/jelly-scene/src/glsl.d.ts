/**
 * Shader-Quelltext als Text und Modelle als Data-URL. Vite (Client, Tests) und esbuild
 * (Server-Bühne mit `--loader:.glsl=text` und `--loader:.glb=dataurl`) liefern beide als
 * Zeichenkette.
 *
 * @module
 */

declare module "*.glsl?raw" {
  const source: string;
  export default source;
}

declare module "*.glb?url&inline" {
  const dataUrl: string;
  export default dataUrl;
}
