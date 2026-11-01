// Baut die UI-Bausteine aus src/ui/ als ein klassisches Skript für das Design-System: window.Jelly,
// das window.React liest. Aufruf: pnpm ds:bundle -- <Zielordner>  (schreibt bundle.js und index.d.ts)
//
// Jede exportierte Funktion in src/ui/*.tsx gilt als Komponente des Bundles. Hilfsfunktionen
// gehören deshalb in .ts-Dateien (wie src/ui/cx.ts).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";

const NAMESPACE = "Jelly";
const out = resolve(process.argv[2] ?? "dist-ds");
const sources = readdirSync("src/ui")
  .filter((file) => file.endsWith(".tsx"))
  .sort();
const components = sources.flatMap((file) =>
  [...readFileSync(join("src/ui", file), "utf8").matchAll(/^export function (\w+)/gm)].map(
    (match) => ({ name: match[1] }),
  ),
);
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: NAMESPACE, components })} */`;
// Die automatische JSX-Runtime, nachgebaut über dem React-Global, das das Design-System lädt.
// jsxs bekommt statische Kinder, als Argumente verteilt, damit React nicht nach Keys fragt.
const jsxShim =
  "var __dsJsx=(function(R){function p(a,k){var q=Object.assign({},a);if(k!==undefined)q.key=k;return q}function j(t,a,k){return R.createElement(t,p(a,k))}function s(t,a,k){var q=p(a,k),c=q.children;delete q.children;return R.createElement.apply(R,[t,q].concat(c))}return{jsx:j,jsxs:s,Fragment:R.Fragment}})(window.React);";

await build({
  configFile: false,
  logLevel: "warn",
  define: { "process.env.NODE_ENV": '"production"' },
  build: {
    outDir: out,
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: "src/ui/index.ts",
      formats: ["iife"],
      name: NAMESPACE,
      fileName: () => "bundle.js",
    },
    rolldownOptions: {
      external: ["react", "react/jsx-runtime"],
      output: { globals: { react: "React", "react/jsx-runtime": "__dsJsx" }, banner: jsxShim },
    },
  },
});

// Der Minifier entfernt Banner-Kommentare, deshalb kommt der Header erst danach dazu.
const js = `${header}\n${readFileSync(join(out, "bundle.js"), "utf8")}`;
if (/<\/script|<!--/i.test(js)) throw new Error("bundle.js enthält </script oder <!--");
writeFileSync(join(out, "bundle.js"), js);

// Eine index.d.ts aus den Deklarationen von src/ui/*.tsx plus PetColor, das sie verwenden.
const tmp = mkdtempSync(join(tmpdir(), "ds-dts-"));
try {
  execFileSync(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "src/ui/index.ts",
      "--ignoreConfig",
      "--declaration",
      "--emitDeclarationOnly",
      "--jsx",
      "react-jsx",
      "--skipLibCheck",
      "--strict",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--rootDir",
      "src",
      "--outDir",
      tmp,
    ],
    { stdio: "inherit" },
  );
  // ponytail: aus src/pet/ nur PetColor; der Rest gehört nicht zur Oberfläche des Bundles.
  const petColor = /^export type PetColor = .*$/m.exec(
    readFileSync(join(tmp, "pet", "types.d.ts"), "utf8"),
  )[0];
  const declarations = sources.map((file) =>
    readFileSync(join(tmp, "ui", file.replace(/\.tsx$/, ".d.ts")), "utf8")
      .replace(/^import .*\n/gm, "")
      .replace(/^export default function Icon/m, "export declare function Icon")
      .replace(/^export \{\};\n/m, ""),
  );
  writeFileSync(
    join(out, "index.d.ts"),
    `// ${NAMESPACE} — types generated from src/ui/*.tsx\nimport type { ComponentProps, ReactNode } from 'react';\n\n${[`${petColor}\n`, ...declarations].join("\n")}`,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`bundle.js + index.d.ts → ${out}`);
