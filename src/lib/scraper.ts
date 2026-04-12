import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";

export interface ScrapedPage {
  title: string;
  content: string;
  imageUrl: string | null;
}

/**
 * Fetches a web page and extracts the main text content and best image.
 */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  const log = logger.child({ component: "scraper", url });

  log.debug("Fetching page");

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Upgrade-Insecure-Requests": "1",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    log.warn({ status: response.status, statusText: response.statusText }, "Page fetch returned non-OK status");
    if (response.status === 403 || response.status === 401) {
      throw new Error(
        `This site blocked automated fetching (${response.status} ${response.statusText})`
      );
    }
    throw new Error(`${response.status} ${response.statusText}`);
  }

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
