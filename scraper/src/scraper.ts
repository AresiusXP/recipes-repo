import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { createReadStream, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  name: process.env.APP_NAME || "recipes-scraper",
});

const execFileAsync = promisify(execFile);

export interface ScrapedPage {
  title: string;
  content: string;
  imageUrl: string | null;
  /** Direct CDN video URL, populated for Instagram reels via yt-dlp. */
  videoUrl?: string | null;
  /** True when the browser fallback (Playwright) was used instead of curl. */
  usedBrowserFallback?: boolean;
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

/**
 * A structured error for when a site requires login / subscription to view content.
 * Raised when curl lands on an auth/login wall even though the HTTP status was 200.
 */
export class LoginWallError extends Error {
  constructor(finalUrl?: string) {
    const detail = finalUrl ? ` (redirected to ${finalUrl})` : "";
    super(`This page requires a login or subscription to view${detail}`);
    this.name = "LoginWallError";
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
    "--write-out", "\n%{http_code}\n%{url_effective}", // append status + final URL
  ];

  for (const [name, value] of Object.entries(headers)) {
    args.push("-H", `${name}: ${value}`);
  }

  args.push(url);
  return args;
}

interface FetchResultWithUrl extends FetchResult {
  effectiveUrl: string;
}

/**
 * Runs curl for the given URL + headers and returns { status, body, effectiveUrl }.
 * Throws on network-level failures (curl exit code != 0 for non-HTTP reasons).
 */
async function runCurl(url: string, headers: HeaderMap): Promise<FetchResultWithUrl> {
  const args = buildCurlArgs(url, headers);

  // execFile does not spawn a shell, so the URL and headers are safe from injection.
  const { stdout } = await execFileAsync("curl", args, {
    maxBuffer: 10 * 1024 * 1024, // 10 MB — generous for any recipe page
    encoding: "utf8",
  });

  // --write-out appends "\n{http_code}\n{url_effective}" after the body.
  // We parse from the end to avoid false matches inside the HTML body.
  const lines = stdout.split("\n");
  const effectiveUrl = lines[lines.length - 1].trim();
  const statusLine = lines[lines.length - 2].trim();
  const body = lines.slice(0, lines.length - 2).join("\n");
  const status = parseInt(statusLine, 10);

  if (isNaN(status)) {
    throw new Error(`curl returned unexpected output (could not parse status code)`);
  }

  return { status, body, effectiveUrl };
}

/**
 * Fetches a URL with a sequence of header strategies, using curl.
 * Returns { body, effectiveUrl } on the first successful (2xx) response.
 * Retries on 403/401; throws SiteBlockedError if all strategies are exhausted.
 * Throws a plain Error for other non-2xx statuses.
 */
async function fetchWithStrategies(
  url: string,
  log: pino.Logger
): Promise<{ body: string; effectiveUrl: string }> {
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

    let result: FetchResultWithUrl;
    try {
      result = await runCurl(url, attempt.headers);
    } catch (err) {
      // curl process-level failure (DNS, timeout, binary not found, etc.)
      // Don't retry — this won't improve with different headers.
      throw err;
    }

    if (result.status >= 200 && result.status < 300) {
      log.debug({ strategy: attempt.label, status: result.status, effectiveUrl: result.effectiveUrl }, "Fetch succeeded");
      return { body: result.body, effectiveUrl: result.effectiveUrl };
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

// ─── Login-wall detection ───

/**
 * Known auth/SSO domains that recipe sites redirect to when content is paywalled.
 * Checked against the effective URL after curl follows all redirects.
 */
const AUTH_DOMAINS = [
  "sso.",
  "login.",
  "auth.",
  "account.",
  "signin.",
  "accounts.",
  "id.",
  "identity.",
  "passport.",
  "mijnmagazines.",
  "roularta.",
];

/**
 * Keywords that strongly indicate a login/paywall page in the page title or body.
 * Checked case-insensitively.
 */
const LOGIN_TITLE_KEYWORDS = [
  "inloggen",
  "aanmelden",
  "log in",
  "login",
  "sign in",
  "signin",
  "registreer",
  "register",
  "subscribe",
  "abonneer",
  "paywall",
];

/**
 * Returns true when the effective URL (after redirects) looks like an auth/SSO domain.
 */
function isAuthDomain(effectiveUrl: string): boolean {
  try {
    const hostname = new URL(effectiveUrl).hostname.toLowerCase();
    return AUTH_DOMAINS.some((d) => hostname.startsWith(d) || hostname.includes("." + d.replace(/\.$/, "")));
  } catch {
    return false;
  }
}

/**
 * Returns true when the page title strongly suggests a login/paywall page.
 */
function isLoginTitle(title: string): boolean {
  const lower = title.toLowerCase().trim();
  return LOGIN_TITLE_KEYWORDS.some((kw) => lower === kw || lower.startsWith(kw + " ") || lower.endsWith(" " + kw));
}

/**
 * Returns true when the HTML body contains multiple strong login-wall signals.
 * We require at least 2 signals to avoid false positives on pages that merely
 * mention login (e.g. a header with a "Log in" link on an otherwise public page).
 */
function hasLoginWallSignals(html: string): boolean {
  const lower = html.toLowerCase();
  const signals = [
    /<input[^>]+type=["']?password["']?/i.test(html),
    lower.includes("wachtwoord vergeten") || lower.includes("forgot password") || lower.includes("reset password"),
    lower.includes("registreer nu") || lower.includes("register now") || lower.includes("create account"),
    (lower.includes("inloggen via") || lower.includes("sign in with") || lower.includes("log in with")) &&
      (lower.includes("facebook") || lower.includes("google") || lower.includes("apple")),
    lower.includes("abonnement") || lower.includes("subscription required") || lower.includes("subscribers only"),
  ];
  return signals.filter(Boolean).length >= 2;
}

/**
 * Detects whether a fetched page is actually a login/auth wall.
 * Returns the reason string if it is, or null if the page looks normal.
 */
function detectLoginWall(
  html: string,
  effectiveUrl: string,
  originalUrl: string
): string | null {
  // Check 1: did curl land on a completely different auth domain?
  if (effectiveUrl && effectiveUrl !== originalUrl && isAuthDomain(effectiveUrl)) {
    return `redirected to auth domain (${effectiveUrl})`;
  }

  // Check 2: page title is a login page title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";
  if (title && isLoginTitle(title)) {
    // Only flag if the page is also very short (real recipe pages are much longer)
    // or has login-wall body signals — avoids false positives on pages with "Login" in the title
    if (html.length < 5000 || hasLoginWallSignals(html)) {
      return `page title is "${title}" and content matches login wall`;
    }
  }

  // Check 3: body has multiple strong login-wall signals
  if (hasLoginWallSignals(html)) {
    return "page body contains multiple login-wall signals";
  }

  return null;
}

// ─── Browser-based fallback (Playwright) ───

/**
 * Fetches a page using a real Chromium browser via Playwright.
 * Used as a fallback when curl is detected to have landed on a login/auth wall.
 *
 * The browser renders JavaScript, follows client-side redirects, and presents
 * a genuine browser TLS fingerprint + full browser environment — making it
 * much harder for sites to distinguish from a real user.
 */
/**
 * Resolves the Chromium executable path for Playwright in priority order:
 *
 * 1. `PLAYWRIGHT_EXECUTABLE_PATH` env var — explicit override for any environment
 * 2. `/usr/bin/chromium` — Debian/Ubuntu system Chromium (production container)
 * 3. `/usr/bin/chromium-browser` — alternative Debian/Ubuntu path
 * 4. `undefined` — let Playwright use `channel: "chrome"` (macOS dev with system Chrome)
 *
 * The production Docker image (Debian bookworm) installs Chromium via apt, so
 * path 2 will be used there. On a macOS dev machine without a managed Playwright
 * binary, path 4 falls back to the system Google Chrome via the "chrome" channel.
 */
async function resolveChromiumExecutable(log: pino.Logger): Promise<string | undefined> {
  // 1. Explicit env override — highest priority, works everywhere
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
    log.debug({ path: process.env.PLAYWRIGHT_EXECUTABLE_PATH }, "Using PLAYWRIGHT_EXECUTABLE_PATH from env");
    return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  }

  // 2 & 3. System Chromium installed in the container image
  const { access } = await import("node:fs/promises");
  for (const candidate of ["/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
    try {
      await access(candidate);
      log.debug({ path: candidate }, "Using system Chromium");
      return candidate;
    } catch {
      // not found, try next
    }
  }

  // 4. No explicit path — Playwright will use channel: "chrome" (system Chrome on macOS)
  log.debug("No system Chromium found; will use channel: chrome (macOS dev fallback)");
  return undefined;
}

async function fetchWithBrowser(
  url: string,
  log: pino.Logger
): Promise<{ html: string; effectiveUrl: string }> {
  // Dynamic import so playwright-core is only loaded when actually needed.
  // This keeps the module lightweight for the common (curl-success) path.
  const { chromium } = await import("playwright-core");

  const executablePath = await resolveChromiumExecutable(log);

  log.debug({ executablePath: executablePath ?? "(channel: chrome)" }, "Launching browser for fallback fetch");

  const launchOptions: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      // Required for containerised / Kubernetes environments:
      // --no-zygote disables the zygote process model which requires kernel
      //   namespace features often blocked by default seccomp profiles.
      // --disable-gpu prevents GPU initialisation crashes in headless pods.
      // --disable-crash-reporter stops chrome_crashpad_handler from being
      //   invoked (eliminates the "--database is required" crash on startup).
      // --single-process runs the renderer in the browser process so no
      //   subprocess privilege escalation is needed in locked-down pods.
      "--no-zygote",
      "--disable-gpu",
      "--disable-crash-reporter",
      "--single-process",
    ],
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  } else {
    // macOS dev: use system Google Chrome via the "chrome" channel
    launchOptions.channel = "chrome";
  }

  const browser = await chromium.launch(launchOptions);

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      locale: "nl-NL",
      timezoneId: "Europe/Amsterdam",
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    const page = await context.newPage();

    // Remove the webdriver property that headless browsers expose
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.defineProperty((globalThis as any).navigator, "webdriver", { get: () => undefined });
    });

    log.debug({ url }, "Browser navigating to URL");

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Check HTTP status — some sites return 403 even to real browsers
    if (response && (response.status() === 403 || response.status() === 401)) {
      throw new SiteBlockedError(response.status(), httpStatusText(response.status()));
    }

    // Wait a moment for any JS-driven redirects or content injection to settle
    await page.waitForTimeout(2000);

    const html = await page.content();
    const effectiveUrl = page.url();

    log.debug({ effectiveUrl, htmlLength: html.length }, "Browser fetch completed");

    return { html, effectiveUrl };
  } finally {
    await browser.close();
  }
}

// ─── HTML extraction helpers ───

/**
 * Extracts structured recipe content and metadata from an HTML string.
 * Shared between the curl and browser scraping paths.
 */
function extractFromHtml(html: string): { title: string; content: string; imageUrl: string | null } {
  const $ = cheerio.load(html);

  // Extract JSON-LD structured data before removing scripts
  let content = "";
  let foundJsonLd = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (foundJsonLd) return; // already found a good one
    try {
      const data = JSON.parse($(el).text());
      const recipes = findRecipeJsonLd(data);
      // Try each recipe in the script tag; use the first one that passes quality checks.
      for (const recipe of recipes) {
        const cleaned = cleanRecipeJsonLd(recipe);
        if (isUsableRecipeJsonLd(cleaned)) {
          content = JSON.stringify(cleaned, null, 2);
          foundJsonLd = true;
          break;
        }
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

  return { title: title.trim(), content, imageUrl };
}

// ─── Main scraper ───

/**
 * Fetches a web page and extracts the main text content and best image.
 *
 * Strategy:
 * 1. Try curl with browser-like headers (fast, avoids TLS fingerprint issues).
 * 2. If curl lands on a login/auth wall (detected by redirect domain or page signals),
 *    automatically retry with a real Chromium browser via Playwright.
 * 3. If the browser also lands on a login wall, throw LoginWallError.
 * 4. If curl gets a hard 403/401 on all strategies, also try the browser fallback —
 *    some sites use JS-based bot detection (e.g. Cloudflare) that blocks curl's TLS
 *    fingerprint but allows a real browser through. If the browser also fails or is
 *    blocked, throw SiteBlockedError.
 */
// ─── Instagram reel extraction via yt-dlp ───

/**
 * Returns true if the URL is an Instagram reel or video post.
 */
function isInstagramReelUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "www.instagram.com" ||
        parsed.hostname === "instagram.com") &&
      (parsed.pathname.includes("/reel/") ||
        parsed.pathname.includes("/reels/") ||
        parsed.pathname.includes("/p/"))
    );
  } catch {
    return false;
  }
}

/**
 * yt-dlp metadata shape (subset of fields we care about).
 */
interface YtDlpInfo {
  title?: string;
  description?: string;
  thumbnail?: string;
}

/**
 * Uploads a local video file to the Gemini File API.
 * Returns the Gemini file URI (e.g. "https://generativelanguage.googleapis.com/v1beta/files/abc123")
 * which can be used directly in a generateContent multimodal request.
 *
 * Throws if GEMINI_API_KEY is not set or the upload fails.
 */
async function uploadVideoToGemini(filePath: string, log: pino.Logger): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set — cannot upload video to Gemini");
  }

  const fileStats = statSync(filePath);
  const fileSizeBytes = fileStats.size;
  const mimeType = "video/mp4";

  log.info({ filePath, fileSizeBytes }, "Uploading video to Gemini File API");

  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;

  // Use a raw upload (single request) for files up to ~200 MB
  const fileStream = createReadStream(filePath);

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
      "X-Goog-Upload-Protocol": "raw",
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Header-Content-Length": String(fileSizeBytes),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Length": String(fileSizeBytes),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: fileStream as any,
    duplex: "half",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini File API upload failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const uploadResult = await response.json() as {
    file: { name: string; uri: string; state: string };
  };

  let fileUri = uploadResult.file.uri;
  const fileName = uploadResult.file.name;

  // Wait for the file to become ACTIVE (Gemini processes it asynchronously)
  if (uploadResult.file.state !== "ACTIVE") {
    log.info({ fileName, state: uploadResult.file.state }, "Waiting for Gemini file to become ACTIVE");
    fileUri = await waitForGeminiFileActive(fileName, apiKey, log);
  }

  log.info({ fileUri }, "Gemini file upload complete and ACTIVE");
  return fileUri;
}

/**
 * Polls the Gemini File API until the file reaches ACTIVE state.
 */
async function waitForGeminiFileActive(fileName: string, apiKey: string, log: pino.Logger): Promise<string> {
  const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`;

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const resp = await fetch(pollUrl);
    if (!resp.ok) continue;

    const data = await resp.json() as { name: string; uri: string; state: string };
    log.debug({ state: data.state, attempt: i + 1 }, "Gemini file state poll");

    if (data.state === "ACTIVE") return data.uri;
    if (data.state === "FAILED") throw new Error("Gemini file processing failed");
  }

  throw new Error("Gemini file did not become ACTIVE within timeout");
}

/**
 * Extracts an Instagram reel's metadata (caption, thumbnail) using yt-dlp,
 * downloads and muxes the video into a temp mp4 file, uploads it to the
 * Gemini File API, and returns the Gemini file URI as `videoUrl`.
 *
 * If GEMINI_API_KEY is not set or the upload fails, falls back to caption-only
 * (videoUrl will be null).
 */
async function scrapeInstagramReel(url: string, parentLog?: pino.Logger): Promise<ScrapedPage> {
  const log = (parentLog ?? logger).child({ component: "instagram", url });
  log.info("Extracting Instagram reel via yt-dlp");

  // Step 1: get metadata (title, caption, thumbnail) without downloading video
  let raw: string;
  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      "--dump-json",
      "--no-download",
      "--no-playlist",
      url,
    ]);
    raw = stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Instagram /p/ URLs can be photo-only posts or carousels with no video
    // at all — yt-dlp correctly reports "No video formats found!" for these.
    // Fall back to the generic HTML scraper instead of failing the job.
    if (msg.includes("No video formats found")) {
      log.warn(
        { err: msg },
        "Instagram post has no video — falling back to generic page scrape"
      );
      const generic = await scrapeGenericPage(url, log);

      // Instagram's SPA shell means the page body is usually empty when
      // fetched via curl — the caption only shows up in the og:title meta
      // tag (extracted as `title` by extractFromHtml). Since only `content`
      // is forwarded to Gemini for recipe extraction, fall back to using
      // the title (which contains the caption) as content when the body
      // text extraction came up empty.
      if (!generic.content || generic.content.trim().length === 0) {
        return { ...generic, content: generic.title };
      }
      return generic;
    }

    log.error({ err: msg }, "yt-dlp metadata extraction failed");
    throw new Error(`yt-dlp failed to extract Instagram reel: ${msg}`);
  }

  let info: YtDlpInfo;
  try {
    info = JSON.parse(raw) as YtDlpInfo;
  } catch {
    throw new Error("yt-dlp returned invalid JSON");
  }

  const title = info.title ?? "Instagram Reel";
  const content = info.description ?? "";
  const imageUrl = info.thumbnail ?? null;

  log.info({ title, hasCaption: content.length > 0 }, "Instagram reel metadata extracted");

  // Step 2: download + mux video to a temp file, then upload to Gemini File API
  let videoUrl: string | null = null;
  const tmpDir = await mkdtemp(join(tmpdir(), "recipe-reel-"));
  const tmpFile = join(tmpDir, "video.mp4");

  try {
    log.info({ tmpFile }, "Downloading and muxing Instagram reel via yt-dlp");

    // yt-dlp automatically selects best video+audio and muxes via ffmpeg
    await execFileAsync("yt-dlp", [
      "--no-playlist",
      "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
      "--merge-output-format", "mp4",
      "--output", tmpFile,
      url,
    ], { timeout: 120_000 });

    videoUrl = await uploadVideoToGemini(tmpFile, log);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, "Video download/upload failed — will use caption-only extraction");
    videoUrl = null;
  } finally {
    // Clean up temp directory and all its contents regardless of success/failure
    rm(tmpDir, { recursive: true, force: true }).catch(() => {/* ignore */});
  }

  return {
    title,
    content,
    imageUrl,
    videoUrl,
    usedBrowserFallback: false,
  };
}

/**
 * Fetches a page via curl (with browser fallback on login walls / 403s) and
 * extracts recipe content from the resulting HTML. This is the generic,
 * non-Instagram scraping path — extracted so it can also be used as a
 * fallback when an Instagram URL turns out not to have a video (e.g. a
 * photo-only post or carousel), for which yt-dlp cannot extract anything.
 */
async function scrapeGenericPage(url: string, log: pino.Logger): Promise<ScrapedPage> {
  // ── Step 1: try curl ──
  let html: string;
  let effectiveUrl: string;

  try {
    const curlResult = await fetchWithStrategies(url, log);
    html = curlResult.body;
    effectiveUrl = curlResult.effectiveUrl;
  } catch (err) {
    if (err instanceof SiteBlockedError) {
      // curl was blocked (403/401) — try browser fallback before giving up
      log.warn(
        { status: err.status },
        "All curl strategies blocked (403/401) — trying browser fallback"
      );

      let browserHtml: string;
      let browserEffectiveUrl: string;
      try {
        const result = await fetchWithBrowser(url, log);
        browserHtml = result.html;
        browserEffectiveUrl = result.effectiveUrl;
      } catch (browserError) {
        const msg = browserError instanceof Error ? browserError.message : "Unknown error";
        log.warn({ err: msg }, "Browser fallback failed after curl block");
        throw err;
      }

      // Check if the browser also hit a login wall
      const browserLoginWallReason = detectLoginWall(browserHtml, browserEffectiveUrl, url);
      if (browserLoginWallReason) {
        log.warn(
          { browserEffectiveUrl, reason: browserLoginWallReason },
          "Browser fallback landed on login/auth wall after curl block"
        );
        throw new LoginWallError(browserEffectiveUrl);
      }

      // Browser succeeded — extract from browser-rendered HTML
      const extracted = extractFromHtml(browserHtml);
      const result: ScrapedPage = { ...extracted, usedBrowserFallback: true };

      log.info(
        {
          contentLength: result.content.length,
          hasImage: !!result.imageUrl,
          effectiveUrl: browserEffectiveUrl,
          usedBrowserFallback: true,
          title: result.title.slice(0, 100),
        },
        "Page scraped successfully (browser fallback after curl block)"
      );

      return result;
    }
    // Non-403 curl error — re-throw as-is
    throw err;
  }

  // ── Step 2: check for login/auth wall ──
  const loginWallReason = detectLoginWall(html, effectiveUrl, url);

  if (loginWallReason) {
    log.warn({ effectiveUrl, reason: loginWallReason }, "curl landed on login/auth wall — trying browser fallback");

    // ── Step 3: browser fallback ──
    let browserHtml: string;
    let browserEffectiveUrl: string;
    try {
      const result = await fetchWithBrowser(url, log);
      browserHtml = result.html;
      browserEffectiveUrl = result.effectiveUrl;
    } catch (browserError) {
      const msg = browserError instanceof Error ? browserError.message : "Unknown error";
      log.warn({ err: msg }, "Browser fallback failed");
      throw new LoginWallError(effectiveUrl);
    }

    // Check if the browser also hit a login wall
    const browserLoginWallReason = detectLoginWall(browserHtml, browserEffectiveUrl, url);
    if (browserLoginWallReason) {
      log.warn({ browserEffectiveUrl, reason: browserLoginWallReason }, "Browser fallback also landed on login/auth wall");
      throw new LoginWallError(browserEffectiveUrl);
    }

    // Browser succeeded — extract from browser-rendered HTML
    const extracted = extractFromHtml(browserHtml);
    const result: ScrapedPage = {
      ...extracted,
      usedBrowserFallback: true,
    };

    log.info(
      {
        contentLength: result.content.length,
        hasImage: !!result.imageUrl,
        effectiveUrl: browserEffectiveUrl,
        usedBrowserFallback: true,
        title: result.title.slice(0, 100),
      },
      "Page scraped successfully (browser fallback)"
    );

    return result;
  }

  // ── Step 4: curl succeeded with real content — extract ──
  const extracted = extractFromHtml(html);

  log.info(
    {
      contentLength: extracted.content.length,
      hasImage: !!extracted.imageUrl,
      usedJsonLd: false, // logged inside extractFromHtml if needed
      title: extracted.title.slice(0, 100),
    },
    "Page scraped successfully"
  );

  return extracted;
}

export async function scrapePage(url: string): Promise<ScrapedPage> {
  const log = logger.child({ component: "scraper", url });

  log.debug("Fetching page");

  // ── Instagram reels/posts: use yt-dlp instead of curl/Playwright ──
  if (isInstagramReelUrl(url)) {
    return scrapeInstagramReel(url, log);
  }

  return scrapeGenericPage(url, log);
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

/**
 * Returns a cleaned copy of a Recipe JSON-LD object, keeping only fields that
 * are useful for recipe extraction and discarding noisy/bulky metadata such as
 * comments, reviews, ratings, and author bios.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanRecipeJsonLd(recipe: any): any {
  const KEEP_FIELDS = new Set([
    "@context", "@type", "@id",
    "name", "description",
    "recipeIngredient", "recipeInstructions",
    "recipeYield", "recipeCategory", "recipeCuisine",
    "cookTime", "prepTime", "totalTime",
    "keywords", "image", "url",
    "nutrition",
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleaned: any = {};
  for (const key of Object.keys(recipe)) {
    if (KEEP_FIELDS.has(key)) {
      cleaned[key] = recipe[key];
    }
  }
  return cleaned;
}

/**
 * Returns true when a (cleaned) Recipe JSON-LD object has enough real recipe
 * content to be worth sending to Gemini instead of falling back to DOM text.
 *
 * Minimum bar:
 * - At least 2 ingredients that look like real ingredient strings (not a single
 *   comma-separated blob), OR
 * - At least 1 instruction step
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUsableRecipeJsonLd(recipe: any): boolean {
  const ingredients: unknown = recipe.recipeIngredient;
  const instructions: unknown = recipe.recipeInstructions;

  // Check instructions
  const hasInstructions =
    (Array.isArray(instructions) && instructions.length > 0) ||
    (typeof instructions === "string" && instructions.trim().length > 20);

  // Check ingredients: count valid (non-empty string) items; require at least 2.
  // Using filter instead of every so that occasional null/empty entries in an
  // otherwise valid list don't cause the whole JSON-LD to be rejected.
  const validIngredients = Array.isArray(ingredients)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ingredients.filter((i: any) => typeof i === "string" && i.trim().length > 0)
    : [];
  const hasIngredients = validIngredients.length >= 2;

  return hasInstructions || hasIngredients;
}
