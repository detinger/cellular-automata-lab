# ADR 0004: Build-time schema compilation; static hosting on Netlify and Railway

**Status:** accepted

## Schema compilation

Ajv normally compiles schemas with `new Function`, which would require `script-src 'unsafe-eval'`. Instead, `scripts/compile-schemas.mjs` generates a standalone ESM validator (`src/schemas/generated/modelV1.validate.js`) during `npm run build` and `npm test`. The generated file is committed so that type checking works without a build. Only owned schemas are compiled. Imported files are never treated as schemas.

## Hosting

The app is a static site. Two targets are supported from the same build:

- **Netlify** serves `dist/` directly (`netlify.toml`).
- **Railway** runs `server.mjs`, a dependency-free Node static server. It has an SPA fallback, `/healthz`, immutable caching for hashed assets, path-traversal protection and the same security headers.

Routes are hash-based, so deep links work on any static host without rewrites.
