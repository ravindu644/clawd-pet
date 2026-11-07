// Builds one self-contained dist/clawd.html. `node build.mjs --dev` writes .test/clawd.html with test hooks.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const dev = process.argv.includes('--dev');
const out = dev ? '.test/clawd.html' : 'dist/clawd.html';

const { outputFiles } = await build({
  entryPoints: ['src/main.js', 'src/style.css'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  outdir: 'dist',
  loader: { '.woff2': 'dataurl' },
  define: { DEV: String(dev) },
});
const text = (ext) => outputFiles.find((f) => f.path.endsWith(ext)).text;

// Function replacers: the bundle contains `$&`-style text that a string replacement would expand.
const html = readFileSync('src/index.html', 'utf8')
  .replace('<!-- css -->', () => `<style>${text('.css')}</style>`)
  .replace('<!-- js -->', () => `<script>${text('.js').replace(/<\/script/gi, '<\\/script')}</script>`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
