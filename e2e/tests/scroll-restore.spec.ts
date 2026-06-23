import { test, expect } from "@playwright/test";

/**
 * Scroll position preservation E2E tests.
 *
 * With Cache Components enabled (Next.js 16), navigating into a recipe and
 * back is a soft client-side navigation: the list route is kept mounted
 * (hidden via React <Activity>) so its DOM and scroll position are preserved
 * natively — no manual save/restore. These tests verify that behavior.
 *
 * Requires:
 *   - E2E_SESSION_COOKIE: a valid NextAuth session cookie (JWE-encrypted)
 *   - At least ~15 recipes in the list so the page is taller than the viewport
 *     (seeded before this test runs)
 *
 * Note on selectors: Activity keeps hidden routes in the DOM, so prefer
 * visibility-aware queries (getByRole / { visible: true }) over raw locators.
 */
test.describe("Scroll position preservation", () => {
  test.beforeEach(async ({ context }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "No test session cookie — skipping scroll preservation tests"
    );

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

  test("preserves scroll position when navigating back from a recipe", async ({ page }) => {
    // Count full document loads — a soft client navigation must not trigger one.
    let hardLoads = 0;
    page.on("load", () => {
      hardLoads++;
    });

    // 1. Go to the recipe list and wait for cards to be visible
    await page.goto("/recipes");
    const firstCard = page
      .getByRole("link")
      .filter({ hasText: /Scroll Test Recipe/ })
      .first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });

    // 2. Scroll down ~60% of the page
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight * 0.6, behavior: "instant" });
    });
    await page.waitForTimeout(150);
    const scrollYBefore = await page.evaluate(() => window.scrollY);
    expect(scrollYBefore).toBeGreaterThan(50);

    const loadsBeforeNav = hardLoads;

    // 3. Click a recipe card that is currently within the viewport.
    //    Do NOT scrollIntoView — that would change the scroll position we want
    //    to assert is preserved. Pick the first visible card instead.
    const visibleCard = page
      .getByRole("link")
      .filter({ hasText: /Scroll Test Recipe/ })
      .filter({ visible: true })
      .first();
    await visibleCard.click();

    // 4. Land on the recipe detail page
    await expect(page).toHaveURL(/\/recipes\/[a-z0-9-]+$/, { timeout: 10000 });

    // 5. Browser back
    await page.goBack();
    await expect(page).toHaveURL(/\/recipes$/, { timeout: 10000 });
    await page.waitForTimeout(300);

    // 6. Scroll position preserved within a small tolerance
    const scrollYAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollYAfter - scrollYBefore)).toBeLessThan(100);

    // 7. The forward + back navigation must have been soft (no full reload)
    expect(hardLoads - loadsBeforeNav).toBe(0);
  });

  test("starts at the top on a fresh visit to the recipe list", async ({ page }) => {
    await page.goto("/recipes");
    await expect(
      page.getByRole("link").filter({ hasText: /Scroll Test Recipe/ }).first()
    ).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(150);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });
});
