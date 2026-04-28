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

import { scrapePage, SiteBlockedError } from "@/lib/scraper";

// ─── Helpers ───

function makeHtml(body: string, head = ""): string {
  return `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
}

/**
 * Returns a mock resolved value for execFile simulating curl success.
 * curl stdout format: {body}\n{http_status_code}
 */
function curlOk(html: string, status = 200): Promise<{ stdout: string }> {
  return Promise.resolve({ stdout: `${html}\n${status}` });
}

/**
 * Returns a mock resolved value for execFile simulating a curl HTTP error response.
 * curl exits 0 even on HTTP errors; it only exits non-zero on network failures.
 */
function curlHttpError(status: number): Promise<{ stdout: string }> {
  return Promise.resolve({ stdout: `\n${status}` });
}

/**
 * Returns a mock rejection simulating a curl process-level failure
 * (DNS failure, timeout, binary not found, etc.).
 */
function curlNetworkError(message: string): Promise<never> {
  return Promise.reject(new Error(message));
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

describe("scrapePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
