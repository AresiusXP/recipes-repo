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
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockPrisma: {
    user: { findUnique: vi.fn() },
    recipe: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    tag: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    recipeTag: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
  mockScrapePage: vi.fn(),
  mockExtractRecipeWithGemini: vi.fn(),
  mockTranslateRecipeWithGemini: vi.fn(),
  mockDownloadImage: vi.fn(),
  mockDeleteImage: vi.fn(),
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
}));

vi.mock("@/lib/gemini", () => ({
  extractRecipeWithGemini: (...args: unknown[]) => mockExtractRecipeWithGemini(...args),
  translateRecipeWithGemini: (...args: unknown[]) => mockTranslateRecipeWithGemini(...args),
}));

vi.mock("@/lib/image-storage", () => ({
  downloadImage: (...args: unknown[]) => mockDownloadImage(...args),
  deleteImage: (...args: unknown[]) => mockDeleteImage(...args),
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
} from "@/app/actions/recipes";

const DEFAULT_SESSION = {
  user: { id: "user-1", name: "Test User", email: "test@example.com" },
  expires: "2099-01-01T00:00:00.000Z",
};

describe("importRecipeFromUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
    mockPrisma.user.findUnique.mockResolvedValue({ translateRecipes: true });
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

  it("passes translateToEnglish preference from user settings", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ translateRecipes: false });
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
      { translateToEnglish: false }
    );
  });
});

describe("importRecipeFromText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
    mockPrisma.user.findUnique.mockResolvedValue({ translateRecipes: true });
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
      { translateToEnglish: true }
    );
  });
});

describe("translateRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns error when recipe not found", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue(null);

    const result = await translateRecipe("nonexistent-id");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  it("returns error when user does not own recipe", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "other-user",
      title: "Recipe",
      isTranslatedToEnglish: false,
    });

    const result = await translateRecipe("recipe-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Recipe not found");
  });

  it("returns success immediately if already translated", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      title: "Recipe",
      isTranslatedToEnglish: true,
      sourceLanguage: "es",
    });

    const result = await translateRecipe("recipe-1");

    expect(result.success).toBe(true);
    expect(mockTranslateRecipeWithGemini).not.toHaveBeenCalled();
  });

  it("marks as translated without calling Gemini for English recipes", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      title: "Recipe",
      isTranslatedToEnglish: false,
      sourceLanguage: "en",
    });
    mockPrisma.recipe.update.mockResolvedValue({});

    const result = await translateRecipe("recipe-1");

    expect(result.success).toBe(true);
    expect(mockTranslateRecipeWithGemini).not.toHaveBeenCalled();
    expect(mockPrisma.recipe.update).toHaveBeenCalledWith({
      where: { id: "recipe-1" },
      data: { isTranslatedToEnglish: true },
    });
  });

  it("translates non-English recipe with Gemini", async () => {
    mockPrisma.recipe.findUnique.mockResolvedValue({
      userId: "user-1",
      title: "Receta",
      description: "Una receta",
      ingredients: JSON.stringify(["2 huevos"]),
      steps: JSON.stringify(["Mezclar"]),
      isTranslatedToEnglish: false,
      sourceLanguage: "es",
    });
    mockTranslateRecipeWithGemini.mockResolvedValue({
      title: "Recipe",
      description: "A recipe",
      ingredients: ["2 eggs"],
      steps: ["Mix"],
    });
    mockPrisma.recipe.update.mockResolvedValue({});

    const result = await translateRecipe("recipe-1");

    expect(result.success).toBe(true);
    expect(mockTranslateRecipeWithGemini).toHaveBeenCalled();
    expect(mockPrisma.recipe.update).toHaveBeenCalledWith({
      where: { id: "recipe-1" },
      data: {
        title: "Recipe",
        description: "A recipe",
        ingredients: JSON.stringify(["2 eggs"]),
        steps: JSON.stringify(["Mix"]),
        isTranslatedToEnglish: true,
      },
    });
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
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "other-user" });

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
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1" });
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
    mockPrisma.recipe.findUnique.mockResolvedValue({ userId: "user-1" });
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

    await expect(deleteRecipe("recipe-1")).rejects.toThrow("NEXT_REDIRECT");

    expect(mockDeleteImage).toHaveBeenCalledWith("/media/test.jpg");
    expect(mockPrisma.recipe.delete).toHaveBeenCalledWith({ where: { id: "recipe-1" } });
    expect(mockRedirect).toHaveBeenCalledWith("/recipes");
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
