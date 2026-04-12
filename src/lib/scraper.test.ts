import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

import { scrapePage } from "@/lib/scraper";

function makeHtml(body: string, head = ""): string {
  return `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
}

describe("scrapePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts title from og:title meta tag", async () => {
    const html = makeHtml(
      "<article><p>Some recipe content that is long enough to be considered valid content for the scraper to pick up and use as the main text body of the page.</p></article>",
      '<meta property="og:title" content="My Great Recipe" />'
    );
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const result = await scrapePage("https://example.com/recipe");

    expect(result.title).toBe("My Great Recipe");
  });

  it("falls back to <title> tag when og:title is missing", async () => {
    const html = makeHtml(
      "<article><p>Some recipe content that is long enough to be considered valid content for the scraper.</p></article>",
      "<title>Fallback Title</title>"
    );
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const result = await scrapePage("https://example.com/recipe");

    expect(result.title).toBe("Fallback Title");
  });

  it("extracts og:image as imageUrl", async () => {
    const html = makeHtml(
      "<p>Content</p>",
      '<meta property="og:image" content="https://example.com/photo.jpg" />'
    );
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const result = await scrapePage("https://example.com/recipe");

    expect(result.imageUrl).toBe("https://example.com/photo.jpg");
  });

  it("returns null imageUrl when no image candidates exist", async () => {
    const html = makeHtml("<p>No images here</p>");
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const result = await scrapePage("https://example.com/recipe");

    expect(result.imageUrl).toBeNull();
  });

  it("extracts recipe from JSON-LD structured data", async () => {
    const jsonLd = JSON.stringify({
      "@type": "Recipe",
      name: "Test Recipe",
      recipeIngredient: ["1 cup flour"],
    });
    const html = makeHtml(
      "<p>Body text</p>",
      `<script type="application/ld+json">${jsonLd}</script>`
    );
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Test Recipe");
    expect(result.content).toContain("1 cup flour");
  });

  it("extracts recipe from @graph JSON-LD", async () => {
    const jsonLd = JSON.stringify({
      "@graph": [
        { "@type": "WebPage", name: "Page" },
        { "@type": "Recipe", name: "Graph Recipe", recipeIngredient: ["2 eggs"] },
      ],
    });
    const html = makeHtml(
      "<p>Body text</p>",
      `<script type="application/ld+json">${jsonLd}</script>`
    );
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Graph Recipe");
  });

  it("falls back to article/recipe selectors when no JSON-LD", async () => {
    const longContent = "A ".repeat(150) + "recipe content here";
    const html = makeHtml(`<article>${longContent}</article>`);
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("recipe content here");
  });

  it("falls back to body text as last resort", async () => {
    const html = makeHtml("<p>Just a simple paragraph</p>");
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Just a simple paragraph");
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(scrapePage("https://example.com/missing")).rejects.toThrow(
      "404 Not Found"
    );
  });

  it("throws a user-friendly message on 403 Forbidden", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    await expect(scrapePage("https://example.com/blocked")).rejects.toThrow(
      "This site blocked automated fetching (403 Forbidden)"
    );
  });

  it("throws a user-friendly message on 401 Unauthorized", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    await expect(scrapePage("https://example.com/private")).rejects.toThrow(
      "This site blocked automated fetching (401 Unauthorized)"
    );
  });

  it("sends browser-like headers including User-Agent and Accept-Language", async () => {
    const html = makeHtml("<p>Content</p>");
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(html) });

    await scrapePage("https://example.com/recipe");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Mozilla/5.0");
    expect(headers["Accept-Language"]).toBeTruthy();
    expect(headers["Upgrade-Insecure-Requests"]).toBe("1");
  });

  it("removes script and style tags from content", async () => {
    const html = makeHtml(
      '<p>Visible content</p><script>alert("xss")</script><style>.hidden{}</style>'
    );
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Visible content");
    expect(result.content).not.toContain("alert");
    expect(result.content).not.toContain(".hidden");
  });

  it("cleans up excess whitespace in content", async () => {
    const html = makeHtml("<p>Word1    \n\n\n   Word2</p>");
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toBe("Word1 Word2");
  });
});
