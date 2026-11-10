import { createHash } from 'node:crypto';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes precache.json for the service worker (PLAN.md §8.4 offline caching): every emitted asset plus
 * the static files in public/, under a build ID derived from the emitted file names (content-hashed).
 */
function precacheManifest(): Plugin {
  return {
    name: 'ca-studio-precache',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const all = ['./', 'index.html', 'favicon.svg', 'theme-init.js', ...files.filter((f) => f !== 'index.html')].sort();
      const id = createHash('sha256').update(all.join('\n')).digest('hex').slice(0, 16);
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify({ id, files: all }, null, 2) });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), precacheManifest()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  server: { hmr: process.env.DISABLE_HMR !== 'true' },
});
