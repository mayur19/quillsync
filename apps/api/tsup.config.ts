import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/db/cli.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  // The shared workspace package ships TypeScript sources; bundle it into the API build.
  noExternal: ['@quillsync/shared'],
});
