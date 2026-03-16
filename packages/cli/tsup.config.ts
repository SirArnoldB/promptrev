import { defineConfig } from 'tsup';

export default defineConfig([
  // SDK entry — dual CJS + ESM with types
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
  },
  // CLI binary — ESM only, banner makes it executable
  {
    entry: { 'bin/rev': 'src/bin/rev.ts' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: true,
    splitting: false,
    treeshake: true,
  },
]);
