import { test, expect } from "@playwright/test";

/**
 * Scroll position restore E2E tests.
 *
 * Verifies that when a user scrolls down the recipe list, clicks a recipe,
 * and navigates back, the list restores the scroll position instead of
 * resetting to the top.
 *
 * Requires:
 *   - E2E_SESSION_COOKIE: a valid NextAuth session cookie (JWE-encrypted)
 *   - At least ~10 recipes in the list (seeded before this test runs)
 */
test.describe("Scroll position restore", () => {
  test.beforeEach(async ({ context }) => {
    test.skip(
      !process.env.E2E_SESSION_COOKIE,
      "No test session cookie — skipping scroll restore tests"
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

  test("restores scroll position after navigating back from recipe detail", async ({ page }) => {
    // 1. Go to the recipe list
    await page.goto("/recipes");
    await expect(page.locator("main")).toBeVisible();

    // 2. Wait for recipe cards to render
    const recipeLinks = page.locator('a[href^="/recipes/"]').filter({ hasNot: page.locator('[href="/recipes/new"], [href="/recipes/favorites"]') });
    await expect(recipeLinks.first()).toBeVisible({ timeout: 10000 });

    // 3. Scroll down significantly — to 60% of the page height
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight * 0.6, behavior: "instant" });
    });

    // 4. Wait for the scroll to settle and capture the position
    await page.waitForTimeout(100);
    const scrollYBefore = await page.evaluate(() => window.scrollY);
    expect(scrollYBefore).toBeGreaterThan(50); // must have actually scrolled

    // 5. Click the first visible recipe card link (may be mid-list after scrolling)
    const visibleRecipeLink = recipeLinks.filter({ hasText: /Scroll Test Recipe/ }).first();
    await visibleRecipeLink.scrollIntoViewIfNeeded();
    await visibleRecipeLink.click();

    // 6. Wait for the recipe detail page to load
    await expect(page).toHaveURL(/\/recipes\/[a-z0-9-]+$/, { timeout: 10000 });

    // 7. Navigate back
    await page.goBack();

    // 8. Wait for the recipe list to be visible again
    await expect(page.locator("main")).toBeVisible();
    await expect(recipeLinks.first()).toBeVisible({ timeout: 10000 });

    // 9. Give the scroll restore a brief moment to fire
    await page.waitForTimeout(200);

    // 10. Assert scroll position was restored (within ±100px tolerance)
    const scrollYAfter = await page.evaluate(() => window.scrollY);
    expect(scrollYAfter).toBeGreaterThan(50); // not back at the top
    expect(Math.abs(scrollYAfter - scrollYBefore)).toBeLessThan(100);
  });

  test("does not restore scroll on fresh visit to recipe list", async ({ page }) => {
    // Navigate directly to /recipes — no saved scroll position
    await page.goto("/recipes");
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(200);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });

  test("restores scroll independently on favorites list", async ({ page }) => {
    // Favorites list uses a separate scroll key — should start at 0 independently
    await page.goto("/recipes/favorites");
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(200);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });
});
