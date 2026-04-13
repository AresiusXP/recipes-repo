import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pino from "pino";
import { logger } from "@/lib/logger";

const execFileAsync = promisify(execFile);

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

// ─── Header presets ───

interface HeaderMap {
  [key: string]: string;
}

/**
 * Full Chrome 135 browser navigation headers.
 * Sent for a top-level navigation (typing URL in address bar or clicking a link).
 */
function makeBrowserHeaders(referer?: string): HeaderMap {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
    // Accept-Encoding is omitted — curl --compressed handles it automatically
    // and adding it manually would send a duplicate header.
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
    // Origin is intentionally omitted: browsers do not send it on plain GET navigations.
    ...(referer ? { "Referer": referer } : {}),
  };
}

/**
 * Minimal fallback headers for sites with less aggressive bot detection.
 */
function makeMinimalHeaders(): HeaderMap {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
  };
}

// ─── curl-based fetch ───

interface FetchResult {
  status: number;
  body: string;
}

interface FetchAttempt {
  label: string;
  headers: HeaderMap;
}

/**
 * Builds the curl argument list for a given URL and header map.
 *
 * curl is used instead of Node.js fetch because curl (libcurl) has a different
 * TLS ClientHello fingerprint (JA3/JA4) from Node.js/undici (OpenSSL). Sites
 * using Akamai or similar CDN bot-detection identify and block Node.js's TLS
 * fingerprint regardless of the HTTP headers sent. curl's fingerprint is not
 * in the same blocklists, so it succeeds where fetch fails.
 *
 * --write-out appends "\n%{http_code}" to stdout so we can parse the status
 * code from the last line without needing a separate stderr channel.
 */
function buildCurlArgs(url: string, headers: HeaderMap): string[] {
  const args: string[] = [
    "--silent",           // no progress meter
    "--location",         // follow redirects (e.g. ah.nl/r/... shortlinks)
    "--compressed",       // auto-decompress gzip/br (we advertise it in Accept-Encoding)
    "--max-time", "15",   // 15 s total timeout
    "--max-redirs", "10", // follow up to 10 redirects
    "--write-out", "\n%{http_code}", // append status code as last line of stdout
  ];

  for (const [name, value] of Object.entries(headers)) {
    args.push("-H", `${name}: ${value}`);
  }

  args.push(url);
  return args;
}

/**
 * Runs curl for the given URL + headers and returns { status, body }.
 * Throws on network-level failures (curl exit code != 0 for non-HTTP reasons).
 */
async function runCurl(url: string, headers: HeaderMap): Promise<FetchResult> {
  const args = buildCurlArgs(url, headers);

  // execFile does not spawn a shell, so the URL and headers are safe from injection.
  const { stdout } = await execFileAsync("curl", args, {
    maxBuffer: 10 * 1024 * 1024, // 10 MB — generous for any recipe page
    encoding: "utf8",
  });

  // The last line of stdout is the HTTP status code written by --write-out.
  const lastNewline = stdout.lastIndexOf("\n");
  const statusLine = stdout.slice(lastNewline + 1).trim();
  const body = stdout.slice(0, lastNewline);
  const status = parseInt(statusLine, 10);

  if (isNaN(status)) {
    throw new Error(`curl returned unexpected output (could not parse status code)`);
  }

  return { status, body };
}

/**
 * Fetches a URL with a sequence of header strategies, using curl.
 * Returns the body on the first successful (2xx) response.
 * Retries on 403/401; throws SiteBlockedError if all strategies are exhausted.
 * Throws a plain Error for other non-2xx statuses.
 */
async function fetchWithStrategies(
  url: string,
  log: pino.Logger
): Promise<string> {
  const parsed = new URL(url);
  const homepageReferer = `${parsed.origin}/`;

  const attempts: FetchAttempt[] = [
    // Strategy 1: full browser fingerprint, no referer (direct navigation)
    { label: "browser-direct", headers: makeBrowserHeaders() },
    // Strategy 2: full browser fingerprint + same-site referer (link click)
    { label: "browser-with-referer", headers: makeBrowserHeaders(homepageReferer) },
    // Strategy 3: minimal headers (last resort)
    { label: "minimal", headers: makeMinimalHeaders() },
  ];

  let lastStatus = 0;
  let lastStatusText = "";

  for (const attempt of attempts) {
    log.debug({ strategy: attempt.label }, "Attempting fetch");

    let result: FetchResult;
    try {
      result = await runCurl(url, attempt.headers);
    } catch (err) {
      // curl process-level failure (DNS, timeout, binary not found, etc.)
      // Don't retry — this won't improve with different headers.
      throw err;
    }

    if (result.status >= 200 && result.status < 300) {
      log.debug({ strategy: attempt.label, status: result.status }, "Fetch succeeded");
      return result.body;
    }

    lastStatus = result.status;
    lastStatusText = httpStatusText(result.status);

    log.warn(
      { strategy: attempt.label, status: result.status, statusText: lastStatusText },
      "Fetch attempt returned non-OK status"
    );

    // Only retry on 403/401 — other errors (404, 5xx) won't improve with different headers.
    if (result.status !== 403 && result.status !== 401) {
      break;
    }
  }

  if (lastStatus === 403 || lastStatus === 401) {
    throw new SiteBlockedError(lastStatus, lastStatusText);
  }
  throw new Error(`${lastStatus} ${lastStatusText}`);
}

/** Returns a human-readable status text for common HTTP codes. */
function httpStatusText(status: number): string {
  const texts: Record<number, string> = {
    200: "OK", 301: "Moved Permanently", 302: "Found", 307: "Temporary Redirect",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
    429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway",
    503: "Service Unavailable", 504: "Gateway Timeout",
  };
  return texts[status] ?? "Unknown";
}

// ─── Main scraper ───

/**
 * Fetches a web page and extracts the main text content and best image.
 *
 * Uses curl as the HTTP client to avoid Node.js/undici TLS fingerprint
 * detection by CDN bot-protection systems (e.g. Akamai).
 */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  const log = logger.child({ component: "scraper", url });

  log.debug("Fetching page");

  const html = await fetchWithStrategies(url, log);
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

    if (!content) {
      content = $("body").text().trim();
    }
  }

  // Clean up whitespace
  content = content.replace(/\s+/g, " ").trim();

  log.info(
    {
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
  const candidates: string[] = [];

  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) candidates.push(ogImage);

  const twitterImage = $('meta[name="twitter:image"]').attr("content");
  if (twitterImage) candidates.push(twitterImage);

  const schemaImage =
    $('[itemtype*="Recipe"] [itemprop="image"]').attr("src") ||
    $('[itemtype*="Recipe"] [itemprop="image"]').attr("content");
  if (schemaImage) candidates.push(schemaImage);

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
