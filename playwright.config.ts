import { defineConfig } from '@playwright/test'

// API-level smoke suite. Tests hit the Worker directly (no browser), so the
// `request` fixture needs no browser binaries. The suite shares one local D1
// instance, so it runs serially for determinism.
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8787'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: API_URL,
  },
  // Auto-start the Worker. Assumes local D1 is already seeded (run
  // `bash d1/setup.sh` once). Reuses an existing `npm run dev` if one is up.
  webServer: {
    command: 'npm --prefix worker run dev',
    port: 8787,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
