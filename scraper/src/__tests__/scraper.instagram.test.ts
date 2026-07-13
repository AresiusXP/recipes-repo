import { describe, it, expect, vi, beforeEach } from "vitest";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    // Support both callback-style (used via util.promisify) and plain calls.
    const cb = args[args.length - 1] as (err: unknown, result: unknown) => void;
    execFileMock(...args.slice(0, -1))
      .then((result: unknown) => cb(null, result))
      .catch((err: unknown) => cb(err, undefined));
  },
}));

// scrapeGenericPage relies on curl via execFileAsync too, so this mock covers
// both the yt-dlp calls and the generic curl fallback call made from
// scrapeInstagramReel when yt-dlp reports no video formats.
describe("scrapeInstagramReel fallback for photo-only posts", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("falls back to generic HTML scraping when yt-dlp reports no video formats", async () => {
    // 1st call: yt-dlp --dump-json metadata extraction -> fails with "No video formats found"
    execFileMock.mockImplementationOnce(() =>
      Promise.reject(
        new Error(
          'Command failed: yt-dlp --dump-json --no-download --no-playlist https://www.instagram.com/p/Dau5TN6ju9S/\nERROR: [Instagram] Dau5QFtOkQE: No video formats found!'
        )
      )
    );

    // 2nd call: curl fetch used by scrapeGenericPage's fallback path.
    const fakeHtml =
      '<html><head><title>Photo post</title>' +
      '<meta property="og:title" content="Yummy carousel recipe">' +
      '<meta property="og:image" content="https://example.com/photo.jpg">' +
      '</head><body><article>' +
      'Ingredients: flour, sugar, eggs. Steps: mix, bake, enjoy this delicious cake recipe.' +
      '</article></body></html>';
    execFileMock.mockImplementationOnce(() =>
      Promise.resolve({ stdout: `${fakeHtml}\n200\nhttps://www.instagram.com/p/Dau5TN6ju9S/` })
    );

    const { scrapePage } = await import("../scraper.js");

    const result = await scrapePage("https://www.instagram.com/p/Dau5TN6ju9S/");

    expect(result.videoUrl ?? null).toBeNull();
    expect(result.title).toContain("Yummy carousel recipe");
    expect(result.imageUrl).toBe("https://example.com/photo.jpg");
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("falls back to using the caption (og:title) as content when the SPA shell body has no text", async () => {
    // 1st call: yt-dlp metadata extraction fails with "No video formats found"
    execFileMock.mockImplementationOnce(() =>
      Promise.reject(
        new Error(
          'Command failed: yt-dlp --dump-json --no-download --no-playlist https://www.instagram.com/p/Dau5TN6ju9S/\nERROR: [Instagram] Dau5QFtOkQE: No video formats found!'
        )
      )
    );

    // 2nd call: curl fetch — mimics Instagram's real response, an SPA shell
    // with no rendered body text, where the caption only appears in og:title.
    const fakeHtml =
      '<html><head><title>Instagram</title>' +
      '<meta property="og:title" content=\'Chef Example on Instagram: "Greek Chicken Bowl recipe: ingredients flour sugar eggs"\'>' +
      '<meta property="og:image" content="https://example.com/photo.jpg">' +
      '</head><body></body></html>';
    execFileMock.mockImplementationOnce(() =>
      Promise.resolve({ stdout: `${fakeHtml}\n200\nhttps://www.instagram.com/p/Dau5TN6ju9S/` })
    );

    const { scrapePage } = await import("../scraper.js");

    const result = await scrapePage("https://www.instagram.com/p/Dau5TN6ju9S/");

    expect(result.videoUrl ?? null).toBeNull();
    expect(result.imageUrl).toBe("https://example.com/photo.jpg");
    // content must not be empty — it should fall back to the caption (title)
    // since only `content` is forwarded to Gemini for recipe extraction.
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content).toContain("Greek Chicken Bowl recipe");
  });
});
