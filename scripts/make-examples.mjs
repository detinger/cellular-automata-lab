// `node scripts/make-examples.mjs`: writes examples/*.ca.json and an experiment package from presets.
import { build } from 'vite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'ca-examples-'));
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    ssr: new URL('./make-examples.ts', import.meta.url).pathname,
    outDir: dir,
    emptyOutDir: true,
    rollupOptions: { output: { format: 'es', entryFileNames: 'x.mjs' } },
    target: 'node22',
    minify: false,
  },
  ssr: { noExternal: true },
});
const { examples } = await import(pathToFileURL(join(dir, 'x.mjs')).href);
for (const [name, text] of Object.entries(examples())) await writeFile(new URL(`../examples/${name}`, import.meta.url), text);
await rm(dir, { recursive: true, force: true });
console.log('Wrote examples/');
