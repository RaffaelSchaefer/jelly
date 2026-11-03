/**
 * Shader-Quelltext als Text. Vite (Client, Tests) und esbuild (Server-Bühne mit
 * `--loader:.glsl=text`) liefern `?raw`-Importe als Zeichenkette.
 *
 * @module
 */

declare module "*.glsl?raw" {
  const source: string;
  export default source;
}
