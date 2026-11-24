import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  const apiTarget = `http://${env.API_HOST ?? '127.0.0.1'}:${env.API_PORT ?? '4104'}`;
  return {
    plugins: [react()],
    server: {
      host: 'localhost',
      port: Number(env.WEB_PORT ?? 5104),
      strictPort: true,
      // ws: true forwards the sync WebSocket upgrade; the Origin header is preserved.
      proxy: { '/api': { target: apiTarget, changeOrigin: false, ws: true } },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx'],
        thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      },
    },
  };
});
