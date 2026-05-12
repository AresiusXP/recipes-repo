import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks (these are available before vi.mock hoisting) ───
const {
  mockRedirect,
  mockRevalidatePath,
  mockRequireAuth,
  mockPrisma,
  mockScrapePage,
  mockExtractRecipeWithGemini,
  mockTranslateRecipeWithGemini,
  mockDownloadImage,
  mockDeleteImage,
  mockDuplicateImage,
  mockSaveUploadedImage,
  mockIsLocalMediaPath,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockPrisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    recipe: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    tag: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    recipeTag: { deleteMany: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  mockScrapePage: vi.fn(),
  mockExtractRecipeWithGemini: vi.fn(),
  mockTranslateRecipeWithGemini: vi.fn(),
  mockDownloadImage: vi.fn(),
  mockDeleteImage: vi.fn(),
  mockDuplicateImage: vi.fn(),
  mockSaveUploadedImage: vi.fn(),
  mockIsLocalMediaPath: vi.fn(),
}));

// ─── Module mocks ───
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("@/lib/require-auth", () => ({
  requireAuth: () => mockRequireAuth(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/scraper", () => ({
  scrapePage: (...args: unknown[]) => mockScrapePage(...args),
  // Export the real SiteBlockedError class so tests can throw it
  SiteBlockedError: class SiteBlockedError extends Error {
    readonly status: number;
    readonly statusText: string;
    constructor(status: number, statusText: string) {
      super(`This site blocked automated fetching (${status} ${statusText})`);
      this.name = "SiteBlockedError";
      this.status = status;
      this.statusText = statusText;
    }
  },
  LoginWallError: class LoginWallError extends Error {
    constructor(finalUrl?: string) {
      const detail = finalUrl ? ` (redirected to ${finalUrl})` : "";
      super(`This page requires a login or subscription to view${detail}`);
      this.name = "LoginWallError";
    }
  },
}));

vi.mock("@/lib/gemini", () => ({
  extractRecipeWithGemini: (...args: unknown[]) => mockExtractRecipeWithGemini(...args),
  translateRecipeWithGemini: (...args: unknown[]) => mockTranslateRecipeWithGemini(...args),
}));

vi.mock("@/lib/image-storage", () => ({
  downloadImage: (...args: unknown[]) => mockDownloadImage(...args),
  deleteImage: (...args: unknown[]) => mockDeleteImage(...args),
  duplicateImage: (...args: unknown[]) => mockDuplicateImage(...args),
  saveUploadedImage: (...args: unknown[]) => mockSaveUploadedImage(...args),
  isLocalMediaPath: (...args: unknown[]) => mockIsLocalMediaPath(...args),
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

import {
  importRecipeFromUrl,
  importRecipeFromText,
  translateRecipe,
  updateRecipe,
  deleteRecipe,
  toggleFavorite,
  searchRecipes,
  getUserTags,
  getOtherUsers,
  shareRecipe,
  setCookThisWeek,
  removeCookThisWeek,
} from "@/app/actions/recipes";

import { parseDayMonthYear, getDefaultCookThisWeekExpiry } from "@/lib/cook-this-week";

const DEFAULT_SESSION = {
  user: { id: "user-1", name: "Test User", email: "test@example.com" },
  expires: "2099-01-01T00:00:00.000Z",
};

describe("importRecipeFromUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
    mockPrisma.user.findUnique.mockResolvedValue({ autoTranslateLanguage: null });
  });

  it("returns error for invalid URL", async () => {
    const result = await importRecipeFromUrl("not-a-url");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid URL provided");
  });

  it("returns error when scraping fails", async () => {
    mockScrapePage.mockRejectedValue(new Error("Connection timeout"));

    const result = await importRecipeFromUrl("https://example.com/recipe");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Could not fetch the page");
    expect(result.error).toContain("Connection timeout");
  });

  it("returns siteBlocked result when scraping encounters SiteBlockedError", async () => {
    // Import the mocked SiteBlockedError class from the mock factory
    const { SiteBlockedError } = await import("@/lib/scraper");
    mockScrapePage.mockRejectedValue(new SiteBlockedError(403, "Forbidden"));

    const result = await importRecipeFromUrl("https://example.com/blocked");

    expect(result.success).toBe(false);
    expect(result.siteBlocked).toBe(true);
    expect(result.blockedUrl).toBe("https://example.com/blocked");
    expect(result.error).toContain("403");
    expect(result.error).toContain("Paste Recipe Text");
  });

  it("returns siteBlocked result when scraping encounters LoginWallError", async () => {
    const { LoginWallError } = await import("@/lib/scraper");
    mockScrapePage.mockRejectedValue(new LoginWallError("https://sso.example.com/login"));

    const result = await importRecipeFromUrl("https://example.com/recipe");

    expect(result.success).toBe(false);
    expect(result.siteBlocked).toBe(true);
    expect(result.blockedUrl).toBe("https://example.com/recipe");
    expect(result.error).toContain("login or subscription");
    expect(result.error).toContain("Paste Recipe Text");
  });

  it("returns error when Gemini extraction fails", async () => {
    mockScrapePage.mockResolvedValue({
      title: "Test",
      content: "Some content",
      imageUrl: null,
    });
    mockExtractRecipeWithGemini.mockRejectedValue(new Error("API error"));

    const result = await importRecipeFromUrl("https://example.com/recipe");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Could not extract a recipe");
  });

  it("successfully imports a recipe", async () => {
    mockScrapePage.mockResolvedValue({
      title: "Test Recipe",
      content: "Recipe content",
      imageUrl: "https://example.com/photo.jpg",
    });
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Extracted Recipe",
      description: "A test recipe",
      ingredients: ["1 cup flour"],
      steps: ["Mix ingredients"],
      tags: ["baking"],
      detectedLanguage: "en",
    });
    mockDownloadImage.mockResolvedValue("/media/test.jpg");
    mockPrisma.tag.upsert.mockResolvedValue({ id: "tag-1", name: "baking" });
    mockPrisma.recipe.create.mockResolvedValue({ id: "recipe-1" });

    const result = await importRecipeFromUrl("https://example.com/recipe");

    expect(result.success).toBe(true);
    expect(result.recipeId).toBe("recipe-1");
    expect(mockDownloadImage).toHaveBeenCalledWith("https://example.com/photo.jpg");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/recipes");
  });

  it("handles missing image gracefully", async () => {
    mockScrapePage.mockResolvedValue({
      title: "Test Recipe",
      content: "Recipe content",
      imageUrl: null,
    });
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Extracted Recipe",
      description: "A test recipe",
      ingredients: ["1 cup flour"],
      steps: ["Mix ingredients"],
      tags: [],
      detectedLanguage: "en",
    });
    mockPrisma.recipe.create.mockResolvedValue({ id: "recipe-2" });

    const result = await importRecipeFromUrl("https://example.com/recipe");

    expect(result.success).toBe(true);
    expect(mockDownloadImage).not.toHaveBeenCalled();
  });

  it("passes targetLanguage preference from user settings (off → null)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ autoTranslateLanguage: null });
    mockScrapePage.mockResolvedValue({
      title: "Test",
      content: "Content",
      imageUrl: null,
    });
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Recipe",
      description: "",
      ingredients: [],
      steps: [],
      tags: [],
      detectedLanguage: "es",
    });
    mockPrisma.recipe.create.mockResolvedValue({ id: "recipe-3" });

    await importRecipeFromUrl("https://example.com/recipe");

    expect(mockExtractRecipeWithGemini).toHaveBeenCalledWith(
      "Content",
      "https://example.com/recipe",
      { targetLanguage: null }
    );
  });

  it("passes targetLanguage when user has Dutch auto-translate set", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ autoTranslateLanguage: "nl" });
    mockScrapePage.mockResolvedValue({ title: "Test", content: "Content", imageUrl: null });
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Recept",
      description: "",
      ingredients: [],
      steps: [],
      tags: [],
      detectedLanguage: "es",
    });
    mockPrisma.recipe.create.mockResolvedValue({ id: "recipe-3b" });

    await importRecipeFromUrl("https://example.com/recipe");

    expect(mockExtractRecipeWithGemini).toHaveBeenCalledWith(
      "Content",
      "https://example.com/recipe",
      { targetLanguage: "nl" }
    );
  });
});

describe("importRecipeFromText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
    mockPrisma.user.findUnique.mockResolvedValue({ autoTranslateLanguage: null });
  });

  it("returns error for empty text", async () => {
    const result = await importRecipeFromText("");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe text cannot be empty");
  });

  it("returns error for whitespace-only text", async () => {
    const result = await importRecipeFromText("   \n\t  ");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe text cannot be empty");
  });

  it("successfully imports from text", async () => {
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Manual Recipe",
      description: "Manually entered",
      ingredients: ["2 eggs"],
      steps: ["Crack eggs"],
      tags: ["breakfast"],
      detectedLanguage: "en",
    });
    mockPrisma.tag.upsert.mockResolvedValue({ id: "tag-1", name: "breakfast" });
    mockPrisma.recipe.create.mockResolvedValue({ id: "recipe-4" });

    const result = await importRecipeFromText("2 eggs, crack and cook");

    expect(result.success).toBe(true);
    expect(result.recipeId).toBe("recipe-4");
  });

  it("passes sourceUrl as 'manual entry' when not provided", async () => {
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Recipe",
      description: "",
      ingredients: [],
      steps: [],
      tags: [],
      detectedLanguage: "en",
    });
    mockPrisma.recipe.create.mockResolvedValue({ id: "recipe-5" });

    await importRecipeFromText("Some recipe text");

    expect(mockExtractRecipeWithGemini).toHaveBeenCalledWith(
      "Some recipe text",
      "manual entry",
      { targetLanguage: null }
    );
  });

  it("saves an uploaded image when provided", async () => {
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Manual Recipe",
      description: "Manually entered",
      ingredients: ["2 eggs"],
      steps: ["Crack eggs"],
      tags: [],
      detectedLanguage: "en",
    });
    mockPrisma.recipe.create.mockResolvedValue({ id: "recipe-6" });
    mockSaveUploadedImage.mockResolvedValue("/media/upload.jpg");

    const file = new File([new ArrayBuffer(100)], "photo.jpg", { type: "image/jpeg" });
    const result = await importRecipeFromText("2 eggs, crack and cook", undefined, file);

    expect(result.success).toBe(true);
    expect(mockSaveUploadedImage).toHaveBeenCalledWith(file);
    expect(mockPrisma.recipe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imagePath: "/media/upload.jpg" }),
      })
    );
  });

  it("returns error when uploaded image save fails", async () => {
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Recipe",
      description: "",
      ingredients: [],
      steps: [],
      tags: [],
      detectedLanguage: "en",
    });
    mockSaveUploadedImage.mockResolvedValue(null);

    const file = new File([new ArrayBuffer(100)], "photo.jpg", { type: "image/jpeg" });
    const result = await importRecipeFromText("Some recipe text", undefined, file);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to save image");
    expect(mockPrisma.recipe.create).not.toHaveBeenCalled();
  });

  it("creates recipe with null imagePath when no image file provided", async () => {
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Recipe",
      description: "",
      ingredients: [],
      steps: [],
      tags: [],
      detectedLanguage: "en",
    });
    mockPrisma.recipe.create.mockResolvedValue({ id: "recipe-7" });

    await importRecipeFromText("Some recipe text");

    expect(mockSaveUploadedImage).not.toHaveBeenCalled();
    expect(mockPrisma.recipe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imagePath: null }),
      })
    );
  });
});

describe("translateRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  // ── ownership / not-found ──────────────────────────────────────────────
  it("returns error when recipe not found", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(null);

    const result = await translateRecipe("nonexistent-id", "en");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  it("returns error when user does not own recipe", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "other-user",
      sourceUrl: "https://example.com/recipe",
      rawContent: "content",
      sourceLanguage: "es",
      hasBeenTranslated: false,
      translatedLanguage: null,
    });

    const result = await translateRecipe("recipe-1", "en");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  // ── URL-imported recipe: re-scrapes original link ────────────────────
  it("re-scrapes source URL and extracts into target language for URL recipes", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      sourceUrl: "https://example.com/recipe",
      rawContent: null,
      sourceLanguage: "es",
      hasBeenTranslated: false,
      translatedLanguage: null,
    });
    mockScrapePage.mockResolvedValue({ title: "T", content: "scraped content", imageUrl: null });
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Recipe",
      description: "A recipe",
      ingredients: ["2 eggs"],
      steps: ["Mix"],
      tags: [],
      detectedLanguage: "es",
    });
    mockPrisma.recipe.update.mockResolvedValue({});

    const result = await translateRecipe("recipe-1", "en");

    expect(result.success).toBe(true);
    expect(mockScrapePage).toHaveBeenCalledWith("https://example.com/recipe");
    expect(mockExtractRecipeWithGemini).toHaveBeenCalledWith(
      "scraped content",
      "https://example.com/recipe",
      { targetLanguage: "en" }
    );
    expect(mockPrisma.recipe.update).toHaveBeenCalledWith({
      where: { id: "recipe-1" },
      data: expect.objectContaining({
        title: "Recipe",
        translatedLanguage: "en",
        hasBeenTranslated: true,
      }),
    });
  });

  it("translates URL recipe to Dutch", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      sourceUrl: "https://example.com/recipe",
      rawContent: null,
      sourceLanguage: "es",
      hasBeenTranslated: false,
      translatedLanguage: null,
    });
    mockScrapePage.mockResolvedValue({ title: "T", content: "scraped content", imageUrl: null });
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Recept",
      description: "Een recept",
      ingredients: ["2 eieren"],
      steps: ["Meng"],
      tags: [],
      detectedLanguage: "es",
    });
    mockPrisma.recipe.update.mockResolvedValue({});

    const result = await translateRecipe("recipe-1", "nl");

    expect(result.success).toBe(true);
    expect(mockExtractRecipeWithGemini).toHaveBeenCalledWith(
      "scraped content",
      "https://example.com/recipe",
      { targetLanguage: "nl" }
    );
    expect(mockPrisma.recipe.update).toHaveBeenCalledWith({
      where: { id: "recipe-1" },
      data: expect.objectContaining({ translatedLanguage: "nl" }),
    });
  });

  it("translates URL recipe to Spanish", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      sourceUrl: "https://example.com/recipe",
      rawContent: null,
      sourceLanguage: "en",
      hasBeenTranslated: false,
      translatedLanguage: null,
    });
    mockScrapePage.mockResolvedValue({ title: "T", content: "scraped content", imageUrl: null });
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Receta",
      description: "Una receta",
      ingredients: ["2 huevos"],
      steps: ["Mezclar"],
      tags: [],
      detectedLanguage: "en",
    });
    mockPrisma.recipe.update.mockResolvedValue({});

    const result = await translateRecipe("recipe-1", "es");

    expect(result.success).toBe(true);
    expect(mockExtractRecipeWithGemini).toHaveBeenCalledWith(
      "scraped content",
      "https://example.com/recipe",
      { targetLanguage: "es" }
    );
  });

  it("fails when the source URL is unreachable", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      sourceUrl: "https://example.com/recipe",
      rawContent: null,
      sourceLanguage: "es",
      hasBeenTranslated: false,
      translatedLanguage: null,
    });
    mockScrapePage.mockRejectedValue(new Error("Connection timeout"));

    const result = await translateRecipe("recipe-1", "en");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Could not reach the original recipe page");
    expect(result.error).toContain("Connection timeout");
    expect(mockPrisma.recipe.update).not.toHaveBeenCalled();
  });

  it("does NOT use saved recipe text as translation source for URL recipes", async () => {
    // Only scrapePage + extractRecipeWithGemini should be called, never translateRecipeWithGemini
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      sourceUrl: "https://example.com/recipe",
      rawContent: "old scraped content",
      sourceLanguage: "es",
      hasBeenTranslated: false,
      translatedLanguage: null,
    });
    mockScrapePage.mockResolvedValue({ title: "T", content: "fresh content", imageUrl: null });
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Recipe", description: "", ingredients: [], steps: [], tags: [], detectedLanguage: "es",
    });
    mockPrisma.recipe.update.mockResolvedValue({});

    await translateRecipe("recipe-1", "en");

    expect(mockTranslateRecipeWithGemini).not.toHaveBeenCalled();
    // Gemini is called with FRESH scraped content, not the stored rawContent
    expect(mockExtractRecipeWithGemini).toHaveBeenCalledWith(
      "fresh content",
      "https://example.com/recipe",
      { targetLanguage: "en" }
    );
  });

  // ── Revert to original ────────────────────────────────────────────────
  it("reverts URL recipe to original language (targetLanguage = null)", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      sourceUrl: "https://example.com/recipe",
      rawContent: null,
      sourceLanguage: "es",
      hasBeenTranslated: true,
      translatedLanguage: "en",
    });
    mockScrapePage.mockResolvedValue({ title: "T", content: "scraped", imageUrl: null });
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Receta", description: "", ingredients: [], steps: [], tags: [], detectedLanguage: "es",
    });
    mockPrisma.recipe.update.mockResolvedValue({});

    const result = await translateRecipe("recipe-1", null);

    expect(result.success).toBe(true);
    expect(mockExtractRecipeWithGemini).toHaveBeenCalledWith(
      "scraped",
      "https://example.com/recipe",
      { targetLanguage: null }
    );
    expect(mockPrisma.recipe.update).toHaveBeenCalledWith({
      where: { id: "recipe-1" },
      data: expect.objectContaining({ translatedLanguage: null }),
    });
    // hasBeenTranslated is NOT reset when reverting
    expect(mockPrisma.recipe.update).toHaveBeenCalledWith({
      where: { id: "recipe-1" },
      data: expect.not.objectContaining({ hasBeenTranslated: false }),
    });
  });

  // ── Manual import: one-time translation ────────────────────────────────
  it("translates manual-import recipe once from rawContent", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      sourceUrl: null,
      rawContent: "raw recipe text",
      sourceLanguage: "es",
      hasBeenTranslated: false,
      translatedLanguage: null,
    });
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Recipe", description: "A recipe", ingredients: ["2 eggs"], steps: ["Mix"],
      tags: [], detectedLanguage: "es",
    });
    mockPrisma.recipe.update.mockResolvedValue({});

    const result = await translateRecipe("recipe-1", "en");

    expect(result.success).toBe(true);
    // Must not re-scrape — no sourceUrl
    expect(mockScrapePage).not.toHaveBeenCalled();
    // Must use rawContent as source, not translateRecipeWithGemini
    expect(mockTranslateRecipeWithGemini).not.toHaveBeenCalled();
    expect(mockExtractRecipeWithGemini).toHaveBeenCalledWith(
      "raw recipe text",
      "manual entry",
      { targetLanguage: "en" }
    );
    expect(mockPrisma.recipe.update).toHaveBeenCalledWith({
      where: { id: "recipe-1" },
      data: expect.objectContaining({ hasBeenTranslated: true }),
    });
  });

  it("rejects second translation for manual-import recipe", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      sourceUrl: null,
      rawContent: "raw recipe text",
      sourceLanguage: "es",
      hasBeenTranslated: true, // already translated once
      translatedLanguage: "en",
    });

    const result = await translateRecipe("recipe-1", "nl");

    expect(result.success).toBe(false);
    expect(result.error).toContain("already been translated");
    expect(mockExtractRecipeWithGemini).not.toHaveBeenCalled();
    expect(mockPrisma.recipe.update).not.toHaveBeenCalled();
  });

  it("allows revert to original for manual-import recipe even after translation", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      sourceUrl: null,
      rawContent: "raw recipe text",
      sourceLanguage: "es",
      hasBeenTranslated: true,
      translatedLanguage: "en",
    });
    mockExtractRecipeWithGemini.mockResolvedValue({
      title: "Receta", description: "", ingredients: [], steps: [], tags: [], detectedLanguage: "es",
    });
    mockPrisma.recipe.update.mockResolvedValue({});

    const result = await translateRecipe("recipe-1", null);

    expect(result.success).toBe(true);
    expect(mockExtractRecipeWithGemini).toHaveBeenCalledWith(
      "raw recipe text",
      "manual entry",
      { targetLanguage: null }
    );
  });

  it("returns error when manual-import has no rawContent", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      sourceUrl: null,
      rawContent: null,
      sourceLanguage: "es",
      hasBeenTranslated: false,
      translatedLanguage: null,
    });

    const result = await translateRecipe("recipe-1", "en");

    expect(result.success).toBe(false);
    expect(result.error).toContain("No source content available");
  });
});

describe("updateRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns error when recipe not found", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(null);

    const result = await updateRecipe("nonexistent-id", {
      title: "Updated",
      description: "Updated desc",
      ingredients: [],
      steps: [],
      tags: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  it("returns error when user does not own recipe", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "other-user", imagePath: null });

    const result = await updateRecipe("recipe-1", {
      title: "Updated",
      description: "Updated desc",
      ingredients: [],
      steps: [],
      tags: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  it("normalizes tags to lowercase and trimmed", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1", imagePath: null });
    mockPrisma.tag.upsert.mockImplementation(({ where }: { where: { name: string } }) =>
      Promise.resolve({ id: `tag-${where.name}`, name: where.name })
    );
    mockPrisma.$transaction.mockResolvedValue([]);

    const result = await updateRecipe("recipe-1", {
      title: "Updated",
      description: "Updated desc",
      ingredients: ["flour"],
      steps: ["mix"],
      tags: ["  Italian  ", "DESSERT"],
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: "italian" } })
    );
    expect(mockPrisma.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: "dessert" } })
    );
  });

  it("uses a transaction to delete old tags and update recipe", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1", imagePath: null });
    mockPrisma.tag.upsert.mockResolvedValue({ id: "tag-1", name: "test" });
    mockPrisma.$transaction.mockResolvedValue([]);

    await updateRecipe("recipe-1", {
      title: "Updated",
      description: "Updated desc",
      ingredients: ["flour"],
      steps: ["mix"],
      tags: ["test"],
    });

    expect(mockPrisma.$transaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.anything(), // deleteMany
        expect.anything(), // update
      ])
    );
  });

  it("keeps existing image when imageAction is 'keep'", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1", imagePath: "/media/old.jpg" });
    mockPrisma.tag.upsert.mockResolvedValue({ id: "tag-1", name: "test" });
    mockPrisma.$transaction.mockResolvedValue([]);

    const result = await updateRecipe(
      "recipe-1",
      { title: "Updated", description: "", ingredients: [], steps: [], tags: [] },
      "keep"
    );

    expect(result.success).toBe(true);
    expect(mockSaveUploadedImage).not.toHaveBeenCalled();
    expect(mockDeleteImage).not.toHaveBeenCalled();
  });

  it("replaces image when imageAction is 'replace' and imageFile provided", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1", imagePath: "/media/old.jpg" });
    mockPrisma.tag.upsert.mockResolvedValue({ id: "tag-1", name: "test" });
    mockPrisma.$transaction.mockResolvedValue([]);
    mockSaveUploadedImage.mockResolvedValue("/media/new.jpg");
    mockIsLocalMediaPath.mockReturnValue(true);

    const file = new File([new ArrayBuffer(100)], "photo.jpg", { type: "image/jpeg" });
    const result = await updateRecipe(
      "recipe-1",
      { title: "Updated", description: "", ingredients: [], steps: [], tags: [] },
      "replace",
      file
    );

    expect(result.success).toBe(true);
    expect(mockSaveUploadedImage).toHaveBeenCalledWith(file);
    expect(mockDeleteImage).toHaveBeenCalledWith("/media/old.jpg");
  });

  it("returns error when image save fails during replace", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1", imagePath: null });
    mockSaveUploadedImage.mockResolvedValue(null);

    const file = new File([new ArrayBuffer(100)], "photo.jpg", { type: "image/jpeg" });
    const result = await updateRecipe(
      "recipe-1",
      { title: "Updated", description: "", ingredients: [], steps: [], tags: [] },
      "replace",
      file
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to save image");
  });

  it("removes image and deletes local file when imageAction is 'remove'", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1", imagePath: "/media/old.jpg" });
    mockPrisma.tag.upsert.mockResolvedValue({ id: "tag-1", name: "test" });
    mockPrisma.$transaction.mockResolvedValue([]);
    mockIsLocalMediaPath.mockReturnValue(true);

    const result = await updateRecipe(
      "recipe-1",
      { title: "Updated", description: "", ingredients: [], steps: [], tags: [] },
      "remove"
    );

    expect(result.success).toBe(true);
    expect(mockDeleteImage).toHaveBeenCalledWith("/media/old.jpg");
  });

  it("does not delete old image when it is not a local path during remove", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      imagePath: "https://external.example.com/img.jpg",
    });
    mockPrisma.tag.upsert.mockResolvedValue({ id: "tag-1", name: "test" });
    mockPrisma.$transaction.mockResolvedValue([]);
    mockIsLocalMediaPath.mockReturnValue(false);

    const result = await updateRecipe(
      "recipe-1",
      { title: "Updated", description: "", ingredients: [], steps: [], tags: [] },
      "remove"
    );

    expect(result.success).toBe(true);
    expect(mockDeleteImage).not.toHaveBeenCalled();
  });
});

describe("deleteRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("does nothing when recipe not found", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(null);

    await deleteRecipe("nonexistent-id");

    expect(mockPrisma.recipe.delete).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("does nothing when user does not own recipe", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "other-user",
      imagePath: null,
    });

    await deleteRecipe("recipe-1");

    expect(mockPrisma.recipe.delete).not.toHaveBeenCalled();
  });

  it("deletes recipe and associated image", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      imagePath: "/media/test.jpg",
    });
    mockPrisma.recipe.delete.mockResolvedValue({});
    mockDeleteImage.mockResolvedValue(undefined);
    mockIsLocalMediaPath.mockReturnValue(true);

    await expect(deleteRecipe("recipe-1")).rejects.toThrow("NEXT_REDIRECT");

    expect(mockDeleteImage).toHaveBeenCalledWith("/media/test.jpg");
    expect(mockPrisma.recipe.delete).toHaveBeenCalledWith({ where: { id: "recipe-1" } });
    expect(mockRedirect).toHaveBeenCalledWith("/recipes");
  });

  it("deletes recipe without deleting external image", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      imagePath: "https://external.example.com/img.jpg",
    });
    mockPrisma.recipe.delete.mockResolvedValue({});
    mockIsLocalMediaPath.mockReturnValue(false);

    await expect(deleteRecipe("recipe-1")).rejects.toThrow("NEXT_REDIRECT");

    expect(mockDeleteImage).not.toHaveBeenCalled();
    expect(mockPrisma.recipe.delete).toHaveBeenCalledWith({ where: { id: "recipe-1" } });
  });

  it("deletes recipe without image when imagePath is null", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      imagePath: null,
    });
    mockPrisma.recipe.delete.mockResolvedValue({});

    await expect(deleteRecipe("recipe-1")).rejects.toThrow("NEXT_REDIRECT");

    expect(mockDeleteImage).not.toHaveBeenCalled();
    expect(mockPrisma.recipe.delete).toHaveBeenCalledWith({ where: { id: "recipe-1" } });
  });
});

describe("toggleFavorite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns error when recipe not found", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(null);

    const result = await toggleFavorite("nonexistent-id");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  it("returns error when user does not own recipe", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "other-user",
      isFavorite: false,
    });

    const result = await toggleFavorite("recipe-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  it("toggles favorite from false to true", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      isFavorite: false,
    });
    mockPrisma.recipe.update.mockResolvedValue({ isFavorite: true });

    const result = await toggleFavorite("recipe-1");

    expect(result.success).toBe(true);
    expect(result.isFavorite).toBe(true);
    expect(mockPrisma.recipe.update).toHaveBeenCalledWith({
      where: { id: "recipe-1" },
      data: { isFavorite: true },
      select: { isFavorite: true },
    });
  });

  it("toggles favorite from true to false", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      isFavorite: true,
    });
    mockPrisma.recipe.update.mockResolvedValue({ isFavorite: false });

    const result = await toggleFavorite("recipe-1");

    expect(result.success).toBe(true);
    expect(result.isFavorite).toBe(false);
  });

  it("revalidates all relevant paths", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      isFavorite: false,
    });
    mockPrisma.recipe.update.mockResolvedValue({ isFavorite: true });

    await toggleFavorite("recipe-1");

    expect(mockRevalidatePath).toHaveBeenCalledWith("/recipes");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/recipes/recipe-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/recipes/favorites");
  });
});

describe("searchRecipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns mapped recipe data", async () => {
    mockPrisma.recipe.findMany.mockResolvedValue([
      {
        id: "recipe-1",
        title: "Test Recipe",
        description: "A test",
        imagePath: "/media/test.jpg",
        sourceUrl: "https://example.com",
        isFavorite: true,
        cookThisWeekUntil: null,
        tags: [{ tag: { name: "italian" } }],
        createdAt: new Date("2024-01-01"),
      },
    ]);

    const result = await searchRecipes("", []);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "recipe-1",
      title: "Test Recipe",
      description: "A test",
      imagePath: "/media/test.jpg",
      sourceUrl: "https://example.com",
      isFavorite: true,
      cookThisWeekUntil: null,
      tags: ["italian"],
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("passes favorites filter to query", async () => {
    mockPrisma.recipe.findMany.mockResolvedValue([]);

    await searchRecipes("", [], true);

    expect(mockPrisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isFavorite: true,
        }),
      })
    );
  });

  it("passes text query filter", async () => {
    mockPrisma.recipe.findMany.mockResolvedValue([]);

    await searchRecipes("pasta", []);

    const call = mockPrisma.recipe.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toEqual([
      { title: { contains: "pasta" } },
      { ingredients: { contains: "pasta" } },
      { description: { contains: "pasta" } },
    ]);
  });

  it("passes tag filter", async () => {
    mockPrisma.recipe.findMany.mockResolvedValue([]);

    await searchRecipes("", ["italian", "dessert"]);

    const call = mockPrisma.recipe.findMany.mock.calls[0][0];
    expect(call.where.tags).toEqual({
      some: {
        tag: {
          name: { in: ["italian", "dessert"] },
        },
      },
    });
  });
});

describe("getUserTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns tag names for the authenticated user", async () => {
    mockPrisma.tag.findMany.mockResolvedValue([
      { name: "baking" },
      { name: "italian" },
      { name: "quick" },
    ]);

    const result = await getUserTags();

    expect(result).toEqual(["baking", "italian", "quick"]);
  });

  it("returns empty array when user has no tags", async () => {
    mockPrisma.tag.findMany.mockResolvedValue([]);

    const result = await getUserTags();

    expect(result).toEqual([]);
  });
});

describe("getOtherUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns users other than the current user", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "user-2", name: "Alice", email: "alice@example.com", image: null },
      { id: "user-3", name: "Bob", email: "bob@example.com", image: null },
    ]);

    const result = await getOtherUsers();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("user-2");
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { not: "user-1" } },
      })
    );
  });

  it("returns empty array when there are no other users", async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await getOtherUsers();

    expect(result).toEqual([]);
  });
});

describe("shareRecipe", () => {
  const SOURCE_RECIPE = {
    id: "recipe-1",
    title: "Carbonara",
    description: "Classic pasta",
    sourceUrl: null,
    imagePath: "/media/pasta.jpg",
    ingredients: JSON.stringify(["pasta", "eggs"]),
    steps: JSON.stringify(["boil", "mix"]),
    rawContent: null,
    sourceLanguage: "en",
    isTranslatedToEnglish: true,
    translatedLanguage: null,
    hasBeenTranslated: false,
    userId: "user-1",
    tags: [{ tag: { name: "italian" } }, { tag: { name: "pasta" } }],
  };

  // Minimal transaction mock that runs the callback with a tx that has
  // tag.upsert, recipe.create, and notification.create mocks.
  function makeTxMock(
    txRecipeCreate: ReturnType<typeof vi.fn>,
    txNotificationCreate: ReturnType<typeof vi.fn>
  ) {
    return async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        tag: {
          upsert: vi.fn().mockImplementation(({ where }: { where: { name: string } }) =>
            Promise.resolve({ id: `tag-${where.name}`, name: where.name })
          ),
        },
        recipe: { create: txRecipeCreate },
        notification: { create: txNotificationCreate },
      };
      return fn(tx);
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
    // By default: no duplicate share exists
    mockPrisma.recipe.findFirst.mockResolvedValue(null);
    // By default: image duplication returns a new path
    mockDuplicateImage.mockResolvedValue("/media/pasta-copy.jpg");
  });

  it("returns error when sharing with yourself", async () => {
    const result = await shareRecipe("recipe-1", "user-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot share");
    expect(mockPrisma.recipe.findUnique).not.toHaveBeenCalled();
  });

  it("returns error when recipe not found", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(null);

    const result = await shareRecipe("nonexistent-id", "user-2");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found.");
  });

  it("returns error when user does not own the recipe", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      ...SOURCE_RECIPE,
      userId: "other-user",
    });

    const result = await shareRecipe("recipe-1", "user-2");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found.");
  });

  it("returns error when recipient does not exist", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(SOURCE_RECIPE);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await shareRecipe("recipe-1", "nonexistent-user");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipient user not found.");
  });

  it("returns error when recipe was already shared with this recipient", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(SOURCE_RECIPE);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-2", name: "Alice" });
    // Simulate existing share
    mockPrisma.recipe.findFirst.mockResolvedValue({ id: "existing-copy" });

    const result = await shareRecipe("recipe-1", "user-2");

    expect(result.success).toBe(false);
    expect(result.error).toContain("already shared");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("duplicates the image before creating the copy", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(SOURCE_RECIPE);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-2", name: "Alice" });

    const createdRecipe = { id: "new-recipe-id" };
    mockPrisma.$transaction.mockImplementation(
      makeTxMock(
        vi.fn().mockResolvedValue(createdRecipe),
        vi.fn().mockResolvedValue({})
      )
    );

    await shareRecipe("recipe-1", "user-2");

    expect(mockDuplicateImage).toHaveBeenCalledWith("/media/pasta.jpg");
  });

  it("successfully shares a recipe and creates notification via transaction", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(SOURCE_RECIPE);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-2", name: "Alice" });

    const createdRecipe = { id: "new-recipe-id" };
    mockPrisma.$transaction.mockImplementation(
      makeTxMock(
        vi.fn().mockResolvedValue(createdRecipe),
        vi.fn().mockResolvedValue({})
      )
    );

    const result = await shareRecipe("recipe-1", "user-2");

    expect(result.success).toBe(true);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/recipes");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/notifications");
  });

  it("copies tag records and provenance to the new recipe inside the transaction", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(SOURCE_RECIPE);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-2", name: "Alice" });

    const txRecipeCreate = vi.fn().mockResolvedValue({ id: "new-recipe-id" });
    const txNotificationCreate = vi.fn().mockResolvedValue({});

    mockPrisma.$transaction.mockImplementation(
      makeTxMock(txRecipeCreate, txNotificationCreate)
    );

    await shareRecipe("recipe-1", "user-2");

    expect(txRecipeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-2",
          sharedByUserId: "user-1",
          sharedFromRecipeId: "recipe-1",
          title: "Carbonara",
          imagePath: "/media/pasta-copy.jpg",
        }),
      })
    );
  });
});

// ─── parseDayMonthYear ───

describe("parseDayMonthYear", () => {
  it("parses a valid dd/mm/yyyy string", () => {
    const date = parseDayMonthYear("27/04/2025");
    expect(date.getUTCFullYear()).toBe(2025);
    expect(date.getUTCMonth()).toBe(3); // April = 3 (0-indexed)
    expect(date.getUTCDate()).toBe(27);
    // Should be set to end-of-day UTC
    expect(date.getUTCHours()).toBe(23);
    expect(date.getUTCMinutes()).toBe(59);
    expect(date.getUTCSeconds()).toBe(59);
  });

  it("rejects a string not matching dd/mm/yyyy", () => {
    expect(() => parseDayMonthYear("2025-04-27")).toThrow("Date must be in dd/mm/yyyy format");
    expect(() => parseDayMonthYear("27-04-2025")).toThrow("Date must be in dd/mm/yyyy format");
    expect(() => parseDayMonthYear("not-a-date")).toThrow("Date must be in dd/mm/yyyy format");
  });

  it("rejects an impossible date (e.g. 30 Feb)", () => {
    expect(() => parseDayMonthYear("30/02/2025")).toThrow("Invalid date");
  });
});

// ─── getDefaultCookThisWeekExpiry ───

describe("getDefaultCookThisWeekExpiry", () => {
  it("returns a Date set to end-of-day UTC", () => {
    const result = getDefaultCookThisWeekExpiry();
    expect(result.getUTCHours()).toBe(23);
    expect(result.getUTCMinutes()).toBe(59);
    expect(result.getUTCSeconds()).toBe(59);
  });

  it("returns a Sunday", () => {
    const result = getDefaultCookThisWeekExpiry();
    // The date is stored end-of-day UTC (23:59:59), so check UTC day
    expect(result.getUTCDay()).toBe(0); // 0 = Sunday in UTC
  });

  it("returns a date >= today", () => {
    const result = getDefaultCookThisWeekExpiry();
    // Strip time for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(result.getTime()).toBeGreaterThanOrEqual(today.getTime());
  });
});

// ─── setCookThisWeek ───

describe("setCookThisWeek", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns error when recipe not found", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(null);

    const result = await setCookThisWeek("nonexistent-id", "27/04/2025");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  it("returns error when user does not own recipe", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "other-user" });

    const result = await setCookThisWeek("recipe-1", "27/04/2025");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  it("returns error for an invalid date string", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1" });

    const result = await setCookThisWeek("recipe-1", "not-a-date");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/dd\/mm\/yyyy/);
  });

  it("returns error for an impossible date", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1" });

    const result = await setCookThisWeek("recipe-1", "30/02/2025");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid date");
  });

  it("saves cookThisWeekUntil and returns the ISO string", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1" });
    const expiryDate = new Date("2025-04-27T23:59:59.999Z");
    mockPrisma.recipe.update.mockResolvedValue({ cookThisWeekUntil: expiryDate });

    const result = await setCookThisWeek("recipe-1", "27/04/2025");

    expect(result.success).toBe(true);
    expect(result.cookThisWeekUntil).toBe(expiryDate.toISOString());
    expect(mockPrisma.recipe.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "recipe-1" },
        data: expect.objectContaining({ cookThisWeekUntil: expect.any(Date) }),
      })
    );
  });

  it("revalidates the recipe page and recipes list", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1" });
    const expiryDate = new Date("2025-04-27T23:59:59.999Z");
    mockPrisma.recipe.update.mockResolvedValue({ cookThisWeekUntil: expiryDate });

    await setCookThisWeek("recipe-1", "27/04/2025");

    expect(mockRevalidatePath).toHaveBeenCalledWith("/recipes");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/recipes/recipe-1");
  });
});

// ─── removeCookThisWeek ───

describe("removeCookThisWeek", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns error when recipe not found", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(null);

    const result = await removeCookThisWeek("nonexistent-id");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  it("returns error when user does not own recipe", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "other-user" });

    const result = await removeCookThisWeek("recipe-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  it("clears cookThisWeekUntil to null", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1" });
    mockPrisma.recipe.update.mockResolvedValue({});

    const result = await removeCookThisWeek("recipe-1");

    expect(result.success).toBe(true);
    expect(mockPrisma.recipe.update).toHaveBeenCalledWith({
      where: { id: "recipe-1" },
      data: { cookThisWeekUntil: null },
    });
  });

  it("revalidates the recipe page and recipes list", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1" });
    mockPrisma.recipe.update.mockResolvedValue({});

    await removeCookThisWeek("recipe-1");

    expect(mockRevalidatePath).toHaveBeenCalledWith("/recipes");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/recipes/recipe-1");
  });
});

// ─── searchRecipes — cookThisWeekOnly filter ───

describe("searchRecipes — cookThisWeekOnly filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("passes cookThisWeekOnly filter using gte: start of today UTC", async () => {
    mockPrisma.recipe.findMany.mockResolvedValue([]);

    await searchRecipes("", [], false, true);

    const call = mockPrisma.recipe.findMany.mock.calls[0][0];
    expect(call.where.cookThisWeekUntil).toBeDefined();
    const gte: Date = call.where.cookThisWeekUntil.gte;
    expect(gte).toBeInstanceOf(Date);
    // The filter should be midnight UTC of today
    expect(gte.getUTCHours()).toBe(0);
    expect(gte.getUTCMinutes()).toBe(0);
    expect(gte.getUTCSeconds()).toBe(0);
    expect(gte.getUTCMilliseconds()).toBe(0);
    // And it should be today's UTC date
    const today = new Date();
    expect(gte.getUTCFullYear()).toBe(today.getUTCFullYear());
    expect(gte.getUTCMonth()).toBe(today.getUTCMonth());
    expect(gte.getUTCDate()).toBe(today.getUTCDate());
  });

  it("does not include cookThisWeekUntil filter when false", async () => {
    mockPrisma.recipe.findMany.mockResolvedValue([]);

    await searchRecipes("", [], false, false);

    const call = mockPrisma.recipe.findMany.mock.calls[0][0];
    expect(call.where.cookThisWeekUntil).toBeUndefined();
  });

  it("maps cookThisWeekUntil to ISO string in returned data", async () => {
    const expiryDate = new Date("2025-04-27T23:59:59.999Z");
    mockPrisma.recipe.findMany.mockResolvedValue([
      {
        id: "recipe-1",
        title: "Pasta",
        description: null,
        imagePath: null,
        sourceUrl: null,
        isFavorite: false,
        cookThisWeekUntil: expiryDate,
        tags: [],
        createdAt: new Date("2024-01-01"),
      },
    ]);

    const result = await searchRecipes("", []);

    expect(result[0].cookThisWeekUntil).toBe(expiryDate.toISOString());
  });

  it("maps null cookThisWeekUntil to null in returned data", async () => {
    mockPrisma.recipe.findMany.mockResolvedValue([
      {
        id: "recipe-1",
        title: "Pasta",
        description: null,
        imagePath: null,
        sourceUrl: null,
        isFavorite: false,
        cookThisWeekUntil: null,
        tags: [],
        createdAt: new Date("2024-01-01"),
      },
    ]);

    const result = await searchRecipes("", []);

    expect(result[0].cookThisWeekUntil).toBeNull();
  });
});
