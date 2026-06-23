import { test, expect } from "@playwright/test";

/**
 * Scroll position preservation E2E tests.
 *
 * The recipe list is dynamic and per-user, so it re-renders on browser Back.
 * RecipeList saves scrollY (to sessionStorage) when leaving for a recipe and
 * restores it on return, re-asserting for a short window so it outlasts the
 * on-Back re-render that would otherwise reset to the top. These tests verify
 * the saved position is restored.
 *
 * Requires:
 *   - E2E_SESSION_COOKIE: a valid NextAuth session cookie (JWE-encrypted)
 *   - At least ~15 recipes in the list so the page is taller than the viewport
 *     (seeded before this test runs)
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

  test("restores scroll position when navigating back from a recipe", async ({ page }) => {
    // 1. Go to the recipe list and wait for cards to be visible
    await page.goto("/recipes");
    const firstCard = page
      .getByRole("link", { name: /Scroll Test Recipe/ })
      .first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });

    // 2. Scroll down ~60% of the page
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight * 0.6, behavior: "instant" });
    });
    await page.waitForTimeout(150);
    const scrollYBefore = await page.evaluate(() => window.scrollY);
    expect(scrollYBefore).toBeGreaterThan(50);

    // 3. Click a recipe card that is verified to be inside the viewport at the
    //    current scroll position (so Playwright does not auto-scroll to reach
    //    it, which would change the very position we want to preserve).
    const cards = page.getByRole("link", { name: /Scroll Test Recipe/ });
    const count = await cards.count();
    const viewportH = await page.evaluate(() => window.innerHeight);
    let target = cards.first();
    for (let i = 0; i < count; i++) {
      const box = await cards.nth(i).boundingBox();
      if (box && box.y >= 0 && box.y + box.height <= viewportH) {
        target = cards.nth(i);
        break;
      }
    }
    await target.click();

    // 4. Land on the recipe detail page
    await expect(page).toHaveURL(/\/recipes\/[a-z0-9-]+$/, { timeout: 10000 });

    // 5. Browser back, then allow the restore window (~1s) to settle.
    await page.goBack();
    await expect(page).toHaveURL(/\/recipes(\?.*)?$/, { timeout: 10000 });
    await page.waitForTimeout(1300);

    // 6. Scroll position restored within a small tolerance
    const scrollYAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollYAfter - scrollYBefore)).toBeLessThan(100);
  });

  test("starts at the top on a fresh visit to the recipe list", async ({ page }) => {
    await page.goto("/recipes");
    await expect(
      page.getByRole("link", { name: /Scroll Test Recipe/ }).first()
    ).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(150);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });
});
