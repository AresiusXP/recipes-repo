import { defineConfig, devices } from "@playwright/test";

/**
 * E2E test configuration.
 *
 * In CI (docker-compose), BASE_URL is set to http://frontend:3000.
 * Locally, it defaults to http://localhost:3000.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // run sequentially to avoid state conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Global setup: seed a test user via the backend API
  globalSetup: "./global-setup.ts",
});
