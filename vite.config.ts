import { defineConfig } from 'vite';

// Relative asset paths: the same build works on GitHub Pages under any repo name.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
} as Parameters<typeof defineConfig>[0]);
