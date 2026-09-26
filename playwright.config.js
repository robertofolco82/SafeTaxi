import {defineConfig, devices} from '@playwright/test';

// Due progetti:
// - demo: app in modalità demo locale (nessun backend), rete esterna simulata;
// - supabase: app collegata allo stack Supabase locale (`npx supabase start`), per i flussi reali di accesso e invio.
const server = (mode, port) => ({
  command: `npx vite build --mode ${mode} --outDir dist-${mode} && npx vite preview --mode ${mode} --outDir dist-${mode} --host 127.0.0.1 --port ${port} --strictPort`,
  url: `http://127.0.0.1:${port}`,
  reuseExistingServer: !process.env.CI,
  timeout: 120000,
});

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Pixel 7'],
    browserName: 'chromium',
    locale: 'it-IT',
    geolocation: {latitude: 41.9009, longitude: 12.5010},
    permissions: ['geolocation'],
  },
  projects: [
    {name: 'demo', testMatch: /demo\.spec\.js/, use: {baseURL: 'http://127.0.0.1:4173'}},
    {name: 'supabase', testMatch: /supabase\.spec\.js/, use: {baseURL: 'http://127.0.0.1:4174'}},
  ],
  webServer: [server('test', 4173), server('integration', 4174)],
});
