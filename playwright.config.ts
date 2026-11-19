import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:4173/', viewport: { width: 1280, height: 720 }, trace: 'off' },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173/', reuseExistingServer: true, timeout: 60_000 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } }],
});
