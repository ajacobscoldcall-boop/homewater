import { defineConfig } from '@playwright/test';

// A dedicated port per run (PW_PORT), and never reuse a server someone else started:
// a stale server would test the wrong build.
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 120_000,
  use: { baseURL: `http://localhost:${port}/`, viewport: { width: 1280, height: 720 }, trace: 'off' },
  webServer: { command: `npx vite preview --port ${port} --strictPort`, url: `http://localhost:${port}/`, reuseExistingServer: false, timeout: 60_000 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } }],
});
