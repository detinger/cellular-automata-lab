// `npm run bench`: bundles scripts/benchEntry.ts with Vite and prints engine throughput per rule and
// lattice size (PLAN.md §9.4). Results depend on the machine; record device details with them.
import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, cpus, totalmem, platform, release } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sizes = (process.env.BENCH_SIZES ?? '128,256,512,1024').split(',').map(Number);
const seconds = Number(process.env.BENCH_SECONDS ?? 1.5);
const dir = await mkdtemp(join(tmpdir(), 'ca-bench-'));
const out = join(dir, 'bench.mjs');
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    ssr: new URL('./benchEntry.ts', import.meta.url).pathname,
    outDir: dir,
    emptyOutDir: true,
    rollupOptions: { output: { format: 'es', entryFileNames: 'bench.mjs' } },
    target: 'node22',
    minify: false,
  },
  ssr: { noExternal: true },
});
const { run } = await import(pathToFileURL(out).href);
console.log(
  `# Engine benchmark\n\nNode ${process.version}, ${platform()} ${release()}, ${cpus()[0]?.model ?? 'unknown CPU'} (${cpus().length} logical), ${(totalmem() / 2 ** 30).toFixed(0)} GiB RAM. Single thread, periodic boundary, ${seconds} s per case.\n`,
);
console.log('| Rule | Lattice | Generations/s | Cell updates/s |\n|---|---|---:|---:|');
for (const r of run(sizes, seconds))
  console.log(`| ${r.rule} | ${r.size} × ${r.size} | ${r.gensPerSecond.toFixed(1)} | ${(r.cellUpdatesPerSecond / 1e6).toFixed(1)} M |`);
await rm(dir, { recursive: true, force: true });
