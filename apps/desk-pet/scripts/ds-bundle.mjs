// Builds src/ui.tsx as one classic script for the design system: window.LanDeskPet,
// reading window.React. Usage: npm run ds:bundle -- <out-dir>  (writes bundle.js and index.d.ts)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';

const out = resolve(process.argv[2] ?? 'dist-ds');
const components = [...readFileSync('src/ui.tsx', 'utf8').matchAll(/^export function (\w+)/gm)].map((m) => ({ name: m[1] }));
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: 'LanDeskPet', components })} */`;
// The automatic JSX runtime, shimmed over the React global the design system loads.
// jsxs gets static children, spread as arguments so React does not ask for keys.
const jsxShim = 'var __dsJsx=(function(R){function p(a,k){var q=Object.assign({},a);if(k!==undefined)q.key=k;return q}function j(t,a,k){return R.createElement(t,p(a,k))}function s(t,a,k){var q=p(a,k),c=q.children;delete q.children;return R.createElement.apply(R,[t,q].concat(c))}return{jsx:j,jsxs:s,Fragment:R.Fragment}})(window.React);';

await build({
  configFile: false,
  logLevel: 'warn',
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: out,
    emptyOutDir: false,
    copyPublicDir: false,
    lib: { entry: 'src/ui.tsx', formats: ['iife'], name: 'LanDeskPet', fileName: () => 'bundle.js' },
    rolldownOptions: {
      external: ['react', 'react/jsx-runtime'],
      output: { globals: { react: 'React', 'react/jsx-runtime': '__dsJsx' }, banner: jsxShim },
    },
  },
});

// The minifier drops banner comments, so the header goes on afterwards.
const js = `${header}\n${readFileSync(join(out, 'bundle.js'), 'utf8')}`;
if (/<\/script|<!--/i.test(js)) throw new Error('bundle.js contains </script or <!--');
writeFileSync(join(out, 'bundle.js'), js);

// One index.d.ts from the declarations of ui.tsx and what it pulls in.
const tmp = mkdtempSync(join(tmpdir(), 'ds-dts-'));
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'src/ui.tsx', '--ignoreConfig', '--declaration', '--emitDeclarationOnly', '--jsx', 'react-jsx', '--skipLibCheck', '--strict', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--outDir', tmp], { stdio: 'inherit' });
  // ponytail: only PetColor from pet.ts; the rest of it is not part of the bundle's surface.
  const petColor = /^export type PetColor = .*$/m.exec(readFileSync(join(tmp, 'pet.d.ts'), 'utf8'))[0];
  const dts = [petColor + '\n', ...['Icon.d.ts', 'ui.d.ts'].map((file) => readFileSync(join(tmp, file), 'utf8')
    .replace(/^import .*\n/gm, '')
    .replace(/^export \{ Icon, type IconName \};\n/m, '')
    .replace(/^export default function Icon/m, 'export declare function Icon')
    .replace(/^export \{\};\n/m, ''))];
  writeFileSync(join(out, 'index.d.ts'), `// LanDeskPet — types generated from src/ui.tsx\nimport type { ComponentProps, ReactNode } from 'react';\n\n${dts.join('\n')}`);
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(`bundle.js + index.d.ts → ${out}`);
