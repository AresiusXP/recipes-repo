import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock child_process before importing the module under test ───
const mockExecFile = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    // execFile(cmd, args, opts, callback) — promisify wraps the callback form
    // We store the mock as the callback-based version; promisify handles the rest.
    // But since we vi.mock and promisify runs at import time, we intercept at
    // the promisified level by making mockExecFile return a promise-like value.
    return mockExecFile(...args);
  },
}));

vi.mock("node:util", () => ({
  promisify:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      // When promisify wraps execFile, the result is called with (cmd, args, opts).
      // Our mockExecFile just returns a promise directly.
      fn(...args),
}));

// ─── Mock playwright-core (browser fallback) ───
const mockBrowserPage = {
  addInitScript: vi.fn().mockResolvedValue(undefined),
  goto: vi.fn().mockResolvedValue(undefined),
  waitForTimeout: vi.fn().mockResolvedValue(undefined),
  content: vi.fn().mockResolvedValue("<html><body><p>Browser content</p></body></html>"),
  url: vi.fn().mockReturnValue("https://example.com/recipe"),
};

const mockBrowserContext = {
  newPage: vi.fn().mockResolvedValue(mockBrowserPage),
};

const mockBrowser = {
  newContext: vi.fn().mockResolvedValue(mockBrowserContext),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockChromium = {
  launch: vi.fn().mockResolvedValue(mockBrowser),
};

vi.mock("playwright-core", () => ({
  chromium: mockChromium,
}));

// Silence the logger during tests
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
  serializeError: (e: unknown) => ({ message: e instanceof Error ? e.message : String(e) }),
}));

import { scrapePage, SiteBlockedError, LoginWallError } from "@/lib/scraper";

// ─── Helpers ───

function makeHtml(body: string, head = ""): string {
  return `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
}

/**
 * Returns a mock resolved value for execFile simulating curl success.
 * curl stdout format: {body}\n{http_status_code}\n{effective_url}
 */
function curlOk(html: string, status = 200, effectiveUrl = "https://example.com/recipe"): Promise<{ stdout: string }> {
  return Promise.resolve({ stdout: `${html}\n${status}\n${effectiveUrl}` });
}

/**
 * Returns a mock resolved value for execFile simulating a curl HTTP error response.
 * curl exits 0 even on HTTP errors; it only exits non-zero on network failures.
 */
function curlHttpError(status: number): Promise<{ stdout: string }> {
  return Promise.resolve({ stdout: `\n${status}\nhttps://example.com/recipe` });
}

/**
 * Returns a mock rejection simulating a curl process-level failure
 * (DNS failure, timeout, binary not found, etc.).
 */
function curlNetworkError(message: string): Promise<never> {
  return Promise.reject(new Error(message));
}

/**
 * Simulates curl being redirected to a login/SSO page (200 OK but login content).
 */
function curlLoginWall(loginHtml: string, ssoUrl = "https://sso.example.com/login"): Promise<{ stdout: string }> {
  return Promise.resolve({ stdout: `${loginHtml}\n200\n${ssoUrl}` });
}

describe("SiteBlockedError", () => {
  it("has the correct name, message, status and statusText", () => {
    const err = new SiteBlockedError(403, "Forbidden");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SiteBlockedError);
    expect(err.name).toBe("SiteBlockedError");
    expect(err.status).toBe(403);
    expect(err.statusText).toBe("Forbidden");
    expect(err.message).toBe("This site blocked automated fetching (403 Forbidden)");
  });
});

describe("LoginWallError", () => {
  it("has the correct name and message", () => {
    const err = new LoginWallError("https://sso.example.com/login");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LoginWallError);
    expect(err.name).toBe("LoginWallError");
    expect(err.message).toContain("login or subscription");
    expect(err.message).toContain("sso.example.com");
  });

  it("works without a finalUrl argument", () => {
    const err = new LoginWallError();
    expect(err.message).toContain("login or subscription");
  });
});

describe("scrapePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset browser mock to default (success) state
    mockBrowserPage.content.mockResolvedValue("<html><body><p>Browser content</p></body></html>");
    mockBrowserPage.url.mockReturnValue("https://example.com/recipe");
    mockBrowserPage.goto.mockResolvedValue(undefined);
    mockBrowser.close.mockResolvedValue(undefined);
    mockChromium.launch.mockResolvedValue(mockBrowser);
  });

  it("extracts title from og:title meta tag", async () => {
    const html = makeHtml(
      "<article><p>Some recipe content that is long enough to be considered valid content for the scraper to pick up and use as the main text body of the page.</p></article>",
      '<meta property="og:title" content="My Great Recipe" />'
    );
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.title).toBe("My Great Recipe");
  });

  it("falls back to <title> tag when og:title is missing", async () => {
    const html = makeHtml(
      "<article><p>Some recipe content that is long enough to be considered valid content for the scraper.</p></article>",
      "<title>Fallback Title</title>"
    );
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.title).toBe("Fallback Title");
  });

  it("extracts og:image as imageUrl", async () => {
    const html = makeHtml(
      "<p>Content</p>",
      '<meta property="og:image" content="https://example.com/photo.jpg" />'
    );
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.imageUrl).toBe("https://example.com/photo.jpg");
  });

  it("returns null imageUrl when no image candidates exist", async () => {
    const html = makeHtml("<p>No images here</p>");
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.imageUrl).toBeNull();
  });

  it("extracts recipe from JSON-LD structured data", async () => {
    const jsonLd = JSON.stringify({
      "@type": "Recipe",
      name: "Test Recipe",
      recipeIngredient: ["240ml flour", "2 eggs"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Mix flour and eggs" }],
    });
    const html = makeHtml(
      "<p>Body text</p>",
      `<script type="application/ld+json">${jsonLd}</script>`
    );
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Test Recipe");
    expect(result.content).toContain("240ml flour");
  });

  it("extracts recipe from @graph JSON-LD", async () => {
    const jsonLd = JSON.stringify({
      "@graph": [
        { "@type": "WebPage", name: "Page" },
        { "@type": "Recipe", name: "Graph Recipe", recipeIngredient: ["2 eggs", "100g butter"] },
      ],
    });
    const html = makeHtml(
      "<p>Body text</p>",
      `<script type="application/ld+json">${jsonLd}</script>`
    );
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Graph Recipe");
  });

  it("falls back to article/recipe selectors when no JSON-LD", async () => {
    const longContent = "A ".repeat(150) + "recipe content here";
    const html = makeHtml(`<article>${longContent}</article>`);
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("recipe content here");
  });

  it("falls back to body text as last resort", async () => {
    const html = makeHtml("<p>Just a simple paragraph</p>");
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Just a simple paragraph");
  });

  it("throws on non-OK, non-403/401 response without retrying", async () => {
    mockExecFile.mockReturnValue(curlHttpError(404));

    await expect(scrapePage("https://example.com/missing")).rejects.toThrow(
      "404"
    );
    // Should only attempt once since 404 is not retryable
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it("throws SiteBlockedError after all retry strategies fail with 403", async () => {
    mockExecFile.mockReturnValue(curlHttpError(403));

    const err = await scrapePage("https://example.com/blocked").catch((e) => e);
    expect(err).toBeInstanceOf(SiteBlockedError);
    expect(err.status).toBe(403);
    expect(err.message).toContain("403");
    // Should attempt all 3 strategies
    expect(mockExecFile).toHaveBeenCalledTimes(3);
  });

  it("throws SiteBlockedError after all retry strategies fail with 401", async () => {
    mockExecFile.mockReturnValue(curlHttpError(401));

    const err = await scrapePage("https://example.com/private").catch((e) => e);
    expect(err).toBeInstanceOf(SiteBlockedError);
    expect(err.status).toBe(401);
    // Should attempt all 3 strategies
    expect(mockExecFile).toHaveBeenCalledTimes(3);
  });

  it("succeeds on second strategy if first returns 403", async () => {
    const html = makeHtml("<p>Content only visible to referer requests</p>");
    mockExecFile
      .mockReturnValueOnce(curlHttpError(403))
      .mockReturnValueOnce(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Content only visible to referer requests");
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });

  it("succeeds on third strategy if first two return 403", async () => {
    const html = makeHtml("<p>Allowed on minimal headers</p>");
    mockExecFile
      .mockReturnValueOnce(curlHttpError(403))
      .mockReturnValueOnce(curlHttpError(403))
      .mockReturnValueOnce(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Allowed on minimal headers");
    expect(mockExecFile).toHaveBeenCalledTimes(3);
  });

  it("passes the URL as the last curl argument", async () => {
    mockExecFile.mockReturnValue(curlOk(makeHtml("<p>Content</p>")));

    await scrapePage("https://example.com/recipe");

    const [cmd, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(cmd).toBe("curl");
    expect(args[args.length - 1]).toBe("https://example.com/recipe");
  });

  it("passes --location flag to follow redirects", async () => {
    mockExecFile.mockReturnValue(curlOk(makeHtml("<p>Content</p>")));

    await scrapePage("https://example.com/recipe");

    const [, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(args).toContain("--location");
  });

  it("passes --compressed flag for automatic decompression", async () => {
    mockExecFile.mockReturnValue(curlOk(makeHtml("<p>Content</p>")));

    await scrapePage("https://example.com/recipe");

    const [, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(args).toContain("--compressed");
  });

  it("passes User-Agent header in curl -H arguments", async () => {
    mockExecFile.mockReturnValue(curlOk(makeHtml("<p>Content</p>")));

    await scrapePage("https://example.com/recipe");

    const [, args] = mockExecFile.mock.calls[0] as [string, string[]];
    const headerArgs = args.filter((_, i) => args[i - 1] === "-H");
    const uaHeader = headerArgs.find((h) => h.startsWith("User-Agent:"));
    expect(uaHeader).toBeTruthy();
    expect(uaHeader).toContain("Mozilla/5.0");
  });

  it("includes a Referer header on second strategy attempt", async () => {
    const html = makeHtml("<p>Content</p>");
    mockExecFile
      .mockReturnValueOnce(curlHttpError(403))
      .mockReturnValueOnce(curlOk(html));

    await scrapePage("https://example.com/recipe");

    const [, secondArgs] = mockExecFile.mock.calls[1] as [string, string[]];
    const headerArgs = secondArgs.filter((_, i) => secondArgs[i - 1] === "-H");
    const refererHeader = headerArgs.find((h) => h.startsWith("Referer:"));
    expect(refererHeader).toBeTruthy();
    expect(refererHeader).toContain("example.com");
  });

  it("throws network error immediately without retrying", async () => {
    mockExecFile.mockReturnValue(curlNetworkError("Connection timeout"));

    await expect(scrapePage("https://example.com/recipe")).rejects.toThrow(
      "Connection timeout"
    );
    // Network errors should not trigger header retries
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it("removes script and style tags from content", async () => {
    const html = makeHtml(
      '<p>Visible content</p><script>alert("xss")</script><style>.hidden{}</style>'
    );
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Visible content");
    expect(result.content).not.toContain("alert");
    expect(result.content).not.toContain(".hidden");
  });

  it("cleans up excess whitespace in content", async () => {
    const html = makeHtml("<p>Word1    \n\n\n   Word2</p>");
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toBe("Word1 Word2");
  });

  // ─── JSON-LD quality gating ───

  it("falls back to article text when JSON-LD Recipe has no instructions and only one ingredient blob", async () => {
    // Simulates paulinacocina.net-style pages: Recipe JSON-LD exists but has no
    // recipeInstructions and a single comma-separated ingredient string.
    const jsonLd = JSON.stringify({
      "@type": "Recipe",
      name: "Tortilla de papas",
      description: "Una receta clásica",
      recipeIngredient: ["cebolla, huevos, papas"],
      // no recipeInstructions
      comment: [{ "@type": "Comment", description: "Muy rica!" }],
    });
    const articleText = "A ".repeat(150) + "real recipe steps here";
    const html = makeHtml(
      `<article>${articleText}</article>`,
      `<script type="application/ld+json">${jsonLd}</script>`
    );
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    // Should use article text, not the sparse JSON-LD
    expect(result.content).toContain("real recipe steps here");
    expect(result.content).not.toContain('"recipeIngredient"');
  });

  it("falls back to article text when JSON-LD Recipe has instructions but only one ingredient blob", async () => {
    // Single-item ingredient array that is a comma-separated blob is not usable
    const jsonLd = JSON.stringify({
      "@type": "Recipe",
      name: "Tortilla",
      recipeIngredient: ["cebolla, huevos, papas"],
      // no recipeInstructions
    });
    const articleText = "A ".repeat(150) + "article fallback content";
    const html = makeHtml(
      `<article>${articleText}</article>`,
      `<script type="application/ld+json">${jsonLd}</script>`
    );
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("article fallback content");
    expect(result.content).not.toContain('"recipeIngredient"');
  });

  it("uses JSON-LD when Recipe has proper ingredient list and instructions", async () => {
    const jsonLd = JSON.stringify({
      "@type": "Recipe",
      name: "Good Recipe",
      recipeIngredient: ["200g flour", "2 eggs", "100ml milk"],
      recipeInstructions: [
        { "@type": "HowToStep", text: "Mix flour and eggs" },
        { "@type": "HowToStep", text: "Add milk and stir" },
      ],
    });
    const html = makeHtml(
      "<p>Body text</p>",
      `<script type="application/ld+json">${jsonLd}</script>`
    );
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Good Recipe");
    expect(result.content).toContain("200g flour");
  });

  it("uses JSON-LD when Recipe has proper ingredient list even without instructions", async () => {
    const jsonLd = JSON.stringify({
      "@type": "Recipe",
      name: "Ingredient-only Recipe",
      recipeIngredient: ["200g flour", "2 eggs"],
      // no recipeInstructions
    });
    const html = makeHtml(
      "<p>Body text</p>",
      `<script type="application/ld+json">${jsonLd}</script>`
    );
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Ingredient-only Recipe");
    expect(result.content).toContain("200g flour");
  });

  it("strips noisy fields (comments, reviews, ratings) from JSON-LD before using it", async () => {
    const jsonLd = JSON.stringify({
      "@type": "Recipe",
      name: "Clean Recipe",
      recipeIngredient: ["200g flour", "2 eggs"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Mix" }],
      comment: [{ "@type": "Comment", description: "Great!" }],
      review: [{ "@type": "Review", reviewBody: "Loved it" }],
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.5" },
    });
    const html = makeHtml(
      "<p>Body text</p>",
      `<script type="application/ld+json">${jsonLd}</script>`
    );
    mockExecFile.mockReturnValue(curlOk(html));

    const result = await scrapePage("https://example.com/recipe");

    // Recipe data should be present
    expect(result.content).toContain("Clean Recipe");
    // Noisy fields should be stripped
    expect(result.content).not.toContain("Great!");
    expect(result.content).not.toContain("Loved it");
    expect(result.content).not.toContain("aggregateRating");
  });

  // ─── Login-wall detection and browser fallback ───

  it("triggers browser fallback when curl is redirected to an SSO/auth domain", async () => {
    const loginHtml = makeHtml(
      '<form><input type="password" name="password"/><a href="/forgot">Wachtwoord vergeten?</a><a href="/register">Registreer nu</a></form>',
      "<title>Inloggen</title>"
    );
    const recipeHtml = makeHtml(
      "<article><p>Delicious recipe content that is long enough to be valid.</p></article>",
      '<meta property="og:title" content="Spaans gevulde zoete aardappels" />'
    );

    // curl returns login page (redirected to sso domain)
    mockExecFile.mockReturnValue(curlLoginWall(loginHtml, "https://sso.roularta.nl/login"));

    // browser returns the real recipe page
    mockBrowserPage.content.mockResolvedValue(recipeHtml);
    mockBrowserPage.url.mockReturnValue("https://deliciousmagazine.nl/recepten/spaans-gevulde-zoete-aardappels/");

    const result = await scrapePage("https://deliciousmagazine.nl/recepten/spaans-gevulde-zoete-aardappels/");

    expect(result.usedBrowserFallback).toBe(true);
    expect(result.title).toBe("Spaans gevulde zoete aardappels");
    expect(mockChromium.launch).toHaveBeenCalledTimes(1);
  });

  it("triggers browser fallback when curl returns a login-wall page on the same domain", async () => {
    // Some sites don't redirect to a separate SSO domain — they show a login form inline
    const loginHtml = makeHtml(
      '<form><input type="password" name="password"/><a href="/forgot">Forgot password?</a><a href="/register">Register now</a></form>',
      "<title>Login</title>"
    );
    const recipeHtml = makeHtml("<article><p>Real recipe content here that is long enough.</p></article>");

    // curl returns login page on the same domain (no redirect)
    mockExecFile.mockReturnValue(curlOk(loginHtml, 200, "https://example.com/recipe"));

    // browser returns the real recipe page
    mockBrowserPage.content.mockResolvedValue(recipeHtml);
    mockBrowserPage.url.mockReturnValue("https://example.com/recipe");

    const result = await scrapePage("https://example.com/recipe");

    expect(result.usedBrowserFallback).toBe(true);
    expect(mockChromium.launch).toHaveBeenCalledTimes(1);
  });

  it("throws LoginWallError when both curl and browser land on a login wall", async () => {
    const loginHtml = makeHtml(
      '<form><input type="password" name="password"/><a href="/forgot">Wachtwoord vergeten?</a><a href="/register">Registreer nu</a></form>',
      "<title>Inloggen</title>"
    );

    // curl returns login page
    mockExecFile.mockReturnValue(curlLoginWall(loginHtml, "https://sso.example.com/login"));

    // browser also returns login page
    mockBrowserPage.content.mockResolvedValue(loginHtml);
    mockBrowserPage.url.mockReturnValue("https://sso.example.com/login");

    const err = await scrapePage("https://example.com/recipe").catch((e) => e);

    expect(err).toBeInstanceOf(LoginWallError);
    expect(err.message).toContain("login or subscription");
    expect(mockChromium.launch).toHaveBeenCalledTimes(1);
  });

  it("throws LoginWallError when browser fallback itself fails to launch", async () => {
    const loginHtml = makeHtml(
      '<form><input type="password" name="password"/><a href="/forgot">Wachtwoord vergeten?</a><a href="/register">Registreer nu</a></form>',
      "<title>Inloggen</title>"
    );

    // curl returns login page
    mockExecFile.mockReturnValue(curlLoginWall(loginHtml, "https://sso.example.com/login"));

    // browser fails to launch
    mockChromium.launch.mockRejectedValue(new Error("Chromium not found"));

    const err = await scrapePage("https://example.com/recipe").catch((e) => e);

    expect(err).toBeInstanceOf(LoginWallError);
  });

  it("does NOT trigger browser fallback for a normal recipe page (no login signals)", async () => {
    const recipeHtml = makeHtml(
      "<article><p>A delicious recipe with lots of content here.</p></article>",
      '<meta property="og:title" content="Pasta Carbonara" />'
    );

    mockExecFile.mockReturnValue(curlOk(recipeHtml));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.usedBrowserFallback).toBeFalsy();
    expect(mockChromium.launch).not.toHaveBeenCalled();
    expect(result.title).toBe("Pasta Carbonara");
  });

  it("does NOT trigger browser fallback for a page with a login link in the header (not a login wall)", async () => {
    // A normal recipe page that happens to have a "Log in" link in the nav
    const normalPageHtml = makeHtml(
      `<nav><a href="/login">Log in</a></nav>
       <article>
         <h1>Chocolate Cake</h1>
         <p>${"This is a very long recipe description. ".repeat(20)}</p>
       </article>`,
      '<meta property="og:title" content="Chocolate Cake" />'
    );

    mockExecFile.mockReturnValue(curlOk(normalPageHtml));

    const result = await scrapePage("https://example.com/recipe");

    // Should NOT trigger browser fallback — only one weak signal (login link in nav)
    expect(result.usedBrowserFallback).toBeFalsy();
    expect(mockChromium.launch).not.toHaveBeenCalled();
  });

  it("does NOT trigger browser fallback on SiteBlockedError (403)", async () => {
    mockExecFile.mockReturnValue(curlHttpError(403));

    const err = await scrapePage("https://example.com/blocked").catch((e) => e);

    expect(err).toBeInstanceOf(SiteBlockedError);
    // Browser fallback should NOT be attempted for hard 403s
    expect(mockChromium.launch).not.toHaveBeenCalled();
  });

  it("browser fallback sets usedBrowserFallback flag on the result", async () => {
    const loginHtml = makeHtml(
      '<form><input type="password" name="password"/><a href="/forgot">Wachtwoord vergeten?</a><a href="/register">Registreer nu</a></form>',
      "<title>Inloggen</title>"
    );
    const recipeHtml = makeHtml("<article><p>Real recipe content here that is long enough.</p></article>");

    mockExecFile.mockReturnValue(curlLoginWall(loginHtml, "https://sso.example.com/login"));
    mockBrowserPage.content.mockResolvedValue(recipeHtml);
    mockBrowserPage.url.mockReturnValue("https://example.com/recipe");

    const result = await scrapePage("https://example.com/recipe");

    expect(result.usedBrowserFallback).toBe(true);
  });
});
