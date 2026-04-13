import * as cheerio from "cheerio";
import pino from "pino";
import { logger } from "@/lib/logger";

export interface ScrapedPage {
  title: string;
  content: string;
  imageUrl: string | null;
}

/**
 * A structured error for when a site actively blocks automated fetching.
 * Distinguishes from generic network or server errors.
 */
export class SiteBlockedError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string) {
    super(`This site blocked automated fetching (${status} ${statusText})`);
    this.name = "SiteBlockedError";
    this.status = status;
    this.statusText = statusText;
  }
}

// ─── Request header presets ───

/**
 * Headers that closely mimic a Chrome 135 browser navigation request.
 * These are the full set of headers Chromium sends for a top-level navigation.
 */
function makeBrowserHeaders(url: string, referer?: string): Record<string, string> {
  const parsed = new URL(url);
  const origin = parsed.origin;

  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": referer ? "same-origin" : "none",
    "Sec-Fetch-User": "?1",
    "Sec-CH-UA": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "DNT": "1",
    ...(referer ? { "Referer": referer } : {}),
    // Some CDNs check the Host via Origin header on first-party navigation
    "Origin": origin,
  };
}

/**
 * Minimal fallback headers (the old behaviour) for sites that don't care
 * about the full browser fingerprint.
 */
function makeMinimalHeaders(): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
  };
}

// ─── Fetch with retry ───

interface FetchAttempt {
  headers: Record<string, string>;
  label: string;
}

/**
 * Fetches a URL with a sequence of header strategies.
 * Returns the first successful response, or throws the last error.
 */
async function fetchWithStrategies(
  url: string,
  log: pino.Logger
): Promise<Response> {
  const parsed = new URL(url);
  const homepageReferer = `${parsed.origin}/`;

  const attempts: FetchAttempt[] = [
    // Strategy 1: full browser fingerprint, no referer (simulates typing URL in address bar)
    {
      label: "browser-direct",
      headers: makeBrowserHeaders(url),
    },
    // Strategy 2: full browser fingerprint, with same-site homepage referer (simulates clicking a link)
    {
      label: "browser-with-referer",
      headers: makeBrowserHeaders(url, homepageReferer),
    },
    // Strategy 3: minimal/old headers (last resort)
    {
      label: "minimal",
      headers: makeMinimalHeaders(),
    },
  ];

  let lastStatus = 0;
  let lastStatusText = "";

  for (const attempt of attempts) {
    log.debug({ strategy: attempt.label }, "Attempting fetch");

    let response: Response;
    try {
      response = await fetch(url, {
        headers: attempt.headers,
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      // Network-level error (timeout, DNS, etc.) — don't retry with headers
      throw err;
    }

    if (response.ok) {
      log.debug({ strategy: attempt.label, status: response.status }, "Fetch succeeded");
      return response;
    }

    lastStatus = response.status;
    lastStatusText = response.statusText;

    log.warn(
      { strategy: attempt.label, status: response.status, statusText: response.statusText },
      "Fetch attempt returned non-OK status"
    );

    // Only retry on 403/401 — other errors (404, 5xx) won't improve with different headers
    if (response.status !== 403 && response.status !== 401) {
      break;
    }
  }

  // All strategies exhausted or a non-retryable status was encountered
  if (lastStatus === 403 || lastStatus === 401) {
    throw new SiteBlockedError(lastStatus, lastStatusText);
  }
  throw new Error(`${lastStatus} ${lastStatusText}`);
}

// ─── Main scraper ───

/**
 * Fetches a web page and extracts the main text content and best image.
 */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  const log = logger.child({ component: "scraper", url });

  log.debug("Fetching page");

  const response = await fetchWithStrategies(url, log);

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract JSON-LD structured data before removing scripts
  let content = "";
  let foundJsonLd = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const recipes = findRecipeJsonLd(data);
      if (recipes.length > 0) {
        content = JSON.stringify(recipes[0], null, 2);
        foundJsonLd = true;
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });

  // Remove scripts, styles, nav, footer, ads
  $("script, style, nav, footer, header, iframe, noscript, .ad, .ads, .advertisement").remove();

  // Extract title
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text() ||
    $("h1").first().text() ||
    "Untitled";

  // Extract the best image for the recipe
  const imageUrl = findBestImage($);

  // Fallback to text extraction if no JSON-LD recipe was found
  if (!content) {
    // Try to find recipe-specific content first
    const recipeSelectors = [
      '[itemtype*="Recipe"]',
      ".recipe",
      "#recipe",
      '[class*="recipe"]',
      "article",
      "main",
    ];

    for (const selector of recipeSelectors) {
      const el = $(selector).first();
      if (el.length && el.text().trim().length > 200) {
        content = el.text().trim();
        break;
      }
    }

    // Final fallback: body text
    if (!content) {
      content = $("body").text().trim();
    }
  }

  // Clean up whitespace
  content = content.replace(/\s+/g, " ").trim();

  log.info(
    {
      status: response.status,
      contentLength: content.length,
      hasImage: !!imageUrl,
      usedJsonLd: foundJsonLd,
      title: title.trim().slice(0, 100),
    },
    "Page scraped successfully"
  );

  return {
    title: title.trim(),
    content,
    imageUrl,
  };
}

function findBestImage($: cheerio.CheerioAPI): string | null {
  // Priority order for finding the recipe image
  const candidates: string[] = [];

  // 1. Open Graph image
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) candidates.push(ogImage);

  // 2. Twitter card image
  const twitterImage = $('meta[name="twitter:image"]').attr("content");
  if (twitterImage) candidates.push(twitterImage);

  // 3. Schema.org Recipe image
  const schemaImage = $('[itemtype*="Recipe"] [itemprop="image"]').attr("src") ||
    $('[itemtype*="Recipe"] [itemprop="image"]').attr("content");
  if (schemaImage) candidates.push(schemaImage);

  // 4. First large image in the article/main content
  const contentImages = $("article img, main img, .recipe img, [class*='recipe'] img");
  contentImages.each((_, img) => {
    const src = $(img).attr("src");
    if (src && !src.includes("icon") && !src.includes("logo") && !src.includes("avatar")) {
      candidates.push(src);
    }
  });

  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * Recursively search for Recipe schema in JSON-LD data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findRecipeJsonLd(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.flatMap(findRecipeJsonLd);
  }
  if (data["@type"] === "Recipe" || data["@type"]?.includes?.("Recipe")) {
    return [data];
  }
  if (data["@graph"]) {
    return findRecipeJsonLd(data["@graph"]);
  }
  return [];
}
