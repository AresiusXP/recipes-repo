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

import { scrapePage, SiteBlockedError } from "@/lib/scraper";

function makeHtml(body: string, head = ""): string {
  return `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
}

function makeOkResponse(html: string): Response {
  return { ok: true, status: 200, statusText: "OK", text: () => Promise.resolve(html) } as unknown as Response;
}

function makeErrorResponse(status: number, statusText: string): Response {
  return { ok: false, status, statusText } as unknown as Response;
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
    mockFetch.mockResolvedValue(makeOkResponse(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.title).toBe("My Great Recipe");
  });

  it("falls back to <title> tag when og:title is missing", async () => {
    const html = makeHtml(
      "<article><p>Some recipe content that is long enough to be considered valid content for the scraper.</p></article>",
      "<title>Fallback Title</title>"
    );
    mockFetch.mockResolvedValue(makeOkResponse(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.title).toBe("Fallback Title");
  });

  it("extracts og:image as imageUrl", async () => {
    const html = makeHtml(
      "<p>Content</p>",
      '<meta property="og:image" content="https://example.com/photo.jpg" />'
    );
    mockFetch.mockResolvedValue(makeOkResponse(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.imageUrl).toBe("https://example.com/photo.jpg");
  });

  it("returns null imageUrl when no image candidates exist", async () => {
    const html = makeHtml("<p>No images here</p>");
    mockFetch.mockResolvedValue(makeOkResponse(html));

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
    mockFetch.mockResolvedValue(makeOkResponse(html));

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
    mockFetch.mockResolvedValue(makeOkResponse(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Graph Recipe");
  });

  it("falls back to article/recipe selectors when no JSON-LD", async () => {
    const longContent = "A ".repeat(150) + "recipe content here";
    const html = makeHtml(`<article>${longContent}</article>`);
    mockFetch.mockResolvedValue(makeOkResponse(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("recipe content here");
  });

  it("falls back to body text as last resort", async () => {
    const html = makeHtml("<p>Just a simple paragraph</p>");
    mockFetch.mockResolvedValue(makeOkResponse(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Just a simple paragraph");
  });

  it("throws on non-OK, non-403/401 response without retrying", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(404, "Not Found"));

    await expect(scrapePage("https://example.com/missing")).rejects.toThrow(
      "404 Not Found"
    );
    // Should only attempt once since 404 is not retryable
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("throws SiteBlockedError after all retry strategies fail with 403", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(403, "Forbidden"));

    const err = await scrapePage("https://example.com/blocked").catch((e) => e);
    expect(err).toBeInstanceOf(SiteBlockedError);
    expect(err.status).toBe(403);
    expect(err.message).toContain("403 Forbidden");
    // Should attempt all 3 strategies
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws SiteBlockedError after all retry strategies fail with 401", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(401, "Unauthorized"));

    const err = await scrapePage("https://example.com/private").catch((e) => e);
    expect(err).toBeInstanceOf(SiteBlockedError);
    expect(err.status).toBe(401);
    // Should attempt all 3 strategies
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("succeeds on second strategy if first returns 403", async () => {
    const html = makeHtml("<p>Content only visible to referer requests</p>");
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(403, "Forbidden"))
      .mockResolvedValueOnce(makeOkResponse(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Content only visible to referer requests");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("succeeds on third strategy if first two return 403", async () => {
    const html = makeHtml("<p>Allowed on minimal headers</p>");
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(403, "Forbidden"))
      .mockResolvedValueOnce(makeErrorResponse(403, "Forbidden"))
      .mockResolvedValueOnce(makeOkResponse(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Allowed on minimal headers");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("sends browser-like headers including User-Agent and Accept-Language on first attempt", async () => {
    const html = makeHtml("<p>Content</p>");
    mockFetch.mockResolvedValue(makeOkResponse(html));

    await scrapePage("https://example.com/recipe");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Mozilla/5.0");
    expect(headers["Accept-Language"]).toBeTruthy();
    expect(headers["Upgrade-Insecure-Requests"]).toBe("1");
  });

  it("includes Sec-Fetch-* and Sec-CH-UA headers on first attempt", async () => {
    const html = makeHtml("<p>Content</p>");
    mockFetch.mockResolvedValue(makeOkResponse(html));

    await scrapePage("https://example.com/recipe");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Sec-Fetch-Dest"]).toBe("document");
    expect(headers["Sec-Fetch-Mode"]).toBe("navigate");
    expect(headers["Sec-CH-UA"]).toContain("Chrome");
  });

  it("includes a Referer header on second strategy attempt", async () => {
    const html = makeHtml("<p>Content</p>");
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(403, "Forbidden"))
      .mockResolvedValueOnce(makeOkResponse(html));

    await scrapePage("https://example.com/recipe");

    const [, secondInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    const headers = secondInit.headers as Record<string, string>;
    expect(headers["Referer"]).toBeTruthy();
    expect(headers["Referer"]).toContain("example.com");
  });

  it("removes script and style tags from content", async () => {
    const html = makeHtml(
      '<p>Visible content</p><script>alert("xss")</script><style>.hidden{}</style>'
    );
    mockFetch.mockResolvedValue(makeOkResponse(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toContain("Visible content");
    expect(result.content).not.toContain("alert");
    expect(result.content).not.toContain(".hidden");
  });

  it("cleans up excess whitespace in content", async () => {
    const html = makeHtml("<p>Word1    \n\n\n   Word2</p>");
    mockFetch.mockResolvedValue(makeOkResponse(html));

    const result = await scrapePage("https://example.com/recipe");

    expect(result.content).toBe("Word1 Word2");
  });
});
