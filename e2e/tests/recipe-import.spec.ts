import { test, expect } from "@playwright/test";

/**
 * Recipe import E2E tests — covers the async import flow with polling UI.
 */

test.describe("Recipe import (async)", () => {
  test.beforeEach(async ({ context }) => {
    test.skip(!process.env.E2E_SESSION_COOKIE, "No test session cookie — skipping authenticated tests");

    await context.addCookies([
      {
        name: "authjs.session-token",
        value: process.env.E2E_SESSION_COOKIE!,
        domain: new URL(process.env.BASE_URL || "http://localhost:3000").hostname,
        path: "/",
        httpOnly: true,
        secure: false,
      },
    ]);
  });

  test("shows import form on new recipe page", async ({ page }) => {
    await page.goto("/recipes/new");
    // Should have a URL import option
    const urlInput = page.locator('input[type="url"], input[placeholder*="url" i], input[placeholder*="http" i]');
    await expect(urlInput.first()).toBeVisible();
  });

  test("shows progress indicator when importing from URL", async ({ page }) => {
    test.skip(!process.env.E2E_TEST_RECIPE_URL, "No test recipe URL provided");

    await page.goto("/recipes/new");

    const urlInput = page.locator('input[type="url"], input[placeholder*="url" i], input[placeholder*="http" i]').first();
    await urlInput.fill(process.env.E2E_TEST_RECIPE_URL!);

    await page.click('button:has-text("Import"), button[type="submit"]');

    // Should show the progress indicator
    await expect(
      page.locator("text=/queued|fetching|extracting/i")
    ).toBeVisible({ timeout: 10000 });
  });

  test("shows error for invalid URL", async ({ page }) => {
    await page.goto("/recipes/new");

    const urlInput = page.locator('input[type="url"], input[placeholder*="url" i], input[placeholder*="http" i]').first();
    await urlInput.fill("not-a-valid-url");

    await page.click('button:has-text("Import"), button[type="submit"]');

    // Should show an error
    await expect(page.locator("text=/invalid|error/i")).toBeVisible({ timeout: 5000 });
  });
});
