import { test, expect } from "@playwright/test";

/**
 * Auth E2E tests.
 *
 * Note: Google/Microsoft OAuth cannot be tested in CI without real credentials.
 * These tests verify the login page renders correctly and error states work.
 * Full auth flow is tested via a test credentials provider (see E2E_TEST_* env vars).
 */

test.describe("Login page", () => {
  test("renders the login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/recipes/i);
    // Login page should have at least one sign-in button
    const signInButtons = page.locator("button, a").filter({ hasText: /sign in|log in|google|microsoft/i });
    await expect(signInButtons.first()).toBeVisible();
  });

  test("shows AccountBanned error when redirected with error param", async ({ page }) => {
    await page.goto("/login?error=AccountBanned");
    await expect(page.locator("text=/banned/i")).toBeVisible();
  });

  test("shows RegistrationNotAllowed error when redirected with error param", async ({ page }) => {
    await page.goto("/login?error=RegistrationNotAllowed");
    await expect(page.locator("text=/not allowed|not permitted/i")).toBeVisible();
  });

  test("redirects authenticated users away from login", async ({ page, context }) => {
    // If already authenticated, /login should redirect to /recipes
    // This test is skipped if no test session is available
    test.skip(!process.env.E2E_SESSION_COOKIE, "No test session cookie available");

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

    await page.goto("/login");
    await expect(page).toHaveURL(/\/recipes/);
  });
});
