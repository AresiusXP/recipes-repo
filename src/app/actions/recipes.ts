"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { scrapePage } from "@/lib/scraper";
import { extractRecipeWithGemini, translateRecipeWithGemini } from "@/lib/gemini";
import { downloadImage, deleteImage } from "@/lib/image-storage";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ─── Types ───

export interface ImportResult {
  success: boolean;
  recipeId?: string;
  error?: string;
  preview?: {
    title: string;
    description: string;
    ingredients: string[];
    steps: string[];
    tags: string[];
    imagePath: string | null;
    sourceUrl: string;
  };
}

export interface RecipeFormData {
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  sourceUrl?: string;
  imagePath?: string | null;
}

// ─── Import from URL ───

export async function importRecipeFromUrl(url: string): Promise<ImportResult> {
  const session = await requireAuth();

  try {
    // Validate URL
    new URL(url);
  } catch {
    return { success: false, error: "Invalid URL provided" };
  }

  try {
    // Load user translation preference
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { translateRecipes: true },
    });
    const translateToEnglish = user?.translateRecipes ?? true;

    // Scrape the page
    let scraped;
    try {
      scraped = await scrapePage(url);
    } catch (scrapeError) {
      const msg = scrapeError instanceof Error ? scrapeError.message : "Unknown error";
      return {
        success: false,
        error: `Could not fetch the page: ${msg}. Try pasting the recipe text manually.`,
      };
    }

    // Extract recipe with Gemini
    let recipe;
    try {
      recipe = await extractRecipeWithGemini(scraped.content, url, { translateToEnglish });
    } catch (aiError) {
      const msg = aiError instanceof Error ? aiError.message : "Unknown error";
      return {
        success: false,
        error: `Could not extract a recipe from this page: ${msg}. Try pasting the recipe text manually.`,
      };
    }

    // Download image if available
    let imagePath: string | null = null;
    if (scraped.imageUrl) {
      // Handle relative URLs
      let absoluteImageUrl = scraped.imageUrl;
      try {
        absoluteImageUrl = new URL(scraped.imageUrl, url).toString();
      } catch {
        // keep as-is if already absolute
      }
      imagePath = await downloadImage(absoluteImageUrl);
      if (!imagePath) {
        console.warn(`Image download returned null for URL: ${absoluteImageUrl}`);
      }
    }

    // Create tags
    const tagRecords = await Promise.all(
      recipe.tags.map(async (name) => {
        return prisma.tag.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      })
    );

    // Determine translation state
    const isEnglish = recipe.detectedLanguage === "en";
    const isTranslatedToEnglish = !isEnglish && translateToEnglish;

    // Create recipe
    const created = await prisma.recipe.create({
      data: {
        title: recipe.title,
        description: recipe.description,
        sourceUrl: url,
        imagePath,
        ingredients: JSON.stringify(recipe.ingredients),
        steps: JSON.stringify(recipe.steps),
        rawContent: scraped.content.slice(0, 50000),
        sourceLanguage: recipe.detectedLanguage,
        isTranslatedToEnglish: isEnglish || isTranslatedToEnglish,
        userId: session.user.id,
        tags: {
          create: tagRecords.map((tag: { id: string; name: string }) => ({
            tagId: tag.id,
          })),
        },
      },
    });

    revalidatePath("/recipes");
    return { success: true, recipeId: created.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import recipe";
    return { success: false, error: message };
  }
}

// ─── Import from manual text ───

export async function importRecipeFromText(
  text: string,
  sourceUrl?: string
): Promise<ImportResult> {
  const session = await requireAuth();

  if (!text.trim()) {
    return { success: false, error: "Recipe text cannot be empty" };
  }

  try {
    // Load user translation preference
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { translateRecipes: true },
    });
    const translateToEnglish = user?.translateRecipes ?? true;

    const recipe = await extractRecipeWithGemini(
      text,
      sourceUrl || "manual entry",
      { translateToEnglish }
    );

    const tagRecords = await Promise.all(
      recipe.tags.map(async (name) => {
        return prisma.tag.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      })
    );

    // Determine translation state
    const isEnglish = recipe.detectedLanguage === "en";
    const isTranslatedToEnglish = !isEnglish && translateToEnglish;

    const created = await prisma.recipe.create({
      data: {
        title: recipe.title,
        description: recipe.description,
        sourceUrl: sourceUrl || null,
        imagePath: null,
        ingredients: JSON.stringify(recipe.ingredients),
        steps: JSON.stringify(recipe.steps),
        rawContent: text.slice(0, 50000),
        sourceLanguage: recipe.detectedLanguage,
        isTranslatedToEnglish: isEnglish || isTranslatedToEnglish,
        userId: session.user.id,
        tags: {
          create: tagRecords.map((tag: { id: string; name: string }) => ({
            tagId: tag.id,
          })),
        },
      },
    });

    revalidatePath("/recipes");
    return { success: true, recipeId: created.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process recipe";
    return { success: false, error: message };
  }
}

// ─── Translate existing recipe ───

export async function translateRecipe(
  recipeId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: {
      userId: true,
      title: true,
      description: true,
      ingredients: true,
      steps: true,
      sourceLanguage: true,
      isTranslatedToEnglish: true,
    },
  });

  if (!recipe || recipe.userId !== session.user.id) {
    return { success: false, error: "Recipe not found" };
  }

  if (recipe.isTranslatedToEnglish) {
    return { success: true }; // Already translated
  }

  if (recipe.sourceLanguage === "en") {
    // Already in English, just mark it
    await prisma.recipe.update({
      where: { id: recipeId },
      data: { isTranslatedToEnglish: true },
    });
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
    return { success: true };
  }

  try {
    const ingredients: string[] = JSON.parse(recipe.ingredients);
    const steps: string[] = JSON.parse(recipe.steps);

    const translated = await translateRecipeWithGemini({
      title: recipe.title,
      description: recipe.description || "",
      ingredients,
      steps,
    });

    await prisma.recipe.update({
      where: { id: recipeId },
      data: {
        title: translated.title,
        description: translated.description,
        ingredients: JSON.stringify(translated.ingredients),
        steps: JSON.stringify(translated.steps),
        isTranslatedToEnglish: true,
      },
    });

    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to translate recipe";
    return { success: false, error: message };
  }
}

// ─── Update recipe ───

export async function updateRecipe(
  recipeId: string,
  data: RecipeFormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();

  // Verify ownership
  const existing = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true },
  });

  if (!existing || existing.userId !== session.user.id) {
    return { success: false, error: "Recipe not found" };
  }

  try {
    // Upsert tags
    const tagRecords = await Promise.all(
      data.tags.map(async (name) => {
        return prisma.tag.upsert({
          where: { name: name.toLowerCase().trim() },
          update: {},
          create: { name: name.toLowerCase().trim() },
        });
      })
    );

    // Delete existing tag associations and update recipe in a transaction
    await prisma.$transaction([
      prisma.recipeTag.deleteMany({
        where: { recipeId },
      }),
      prisma.recipe.update({
        where: { id: recipeId },
        data: {
          title: data.title,
          description: data.description,
          ingredients: JSON.stringify(data.ingredients),
          steps: JSON.stringify(data.steps),
          tags: {
            create: tagRecords.map((tag: { id: string; name: string }) => ({
              tagId: tag.id,
            })),
          },
        },
      }),
    ]);

    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update recipe";
    return { success: false, error: message };
  }
}

// ─── Delete recipe ───

export async function deleteRecipe(recipeId: string): Promise<void> {
  const session = await requireAuth();

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true, imagePath: true },
  });

  if (!recipe || recipe.userId !== session.user.id) {
    return;
  }

  // Delete the image file if it exists
  if (recipe.imagePath) {
    await deleteImage(recipe.imagePath);
  }

  await prisma.recipe.delete({
    where: { id: recipeId },
  });

  revalidatePath("/recipes");
  redirect("/recipes");
}

// ─── Toggle favorite ───

export async function toggleFavorite(
  recipeId: string
): Promise<{ success: boolean; isFavorite?: boolean; error?: string }> {
  const session = await requireAuth();

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true, isFavorite: true },
  });

  if (!recipe || recipe.userId !== session.user.id) {
    return { success: false, error: "Recipe not found" };
  }

  const updated = await prisma.recipe.update({
    where: { id: recipeId },
    data: { isFavorite: !recipe.isFavorite },
    select: { isFavorite: true },
  });

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes/favorites");

  return { success: true, isFavorite: updated.isFavorite };
}

// ─── Search & filter ───

export async function searchRecipes(query: string, tagNames: string[], favoritesOnly = false) {
  const session = await requireAuth();

  const where: Record<string, unknown> = {
    userId: session.user.id,
  };

  if (favoritesOnly) {
    where.isFavorite = true;
  }

  // Text search on title and ingredients
  if (query.trim()) {
    where.OR = [
      { title: { contains: query.trim() } },
      { ingredients: { contains: query.trim() } },
      { description: { contains: query.trim() } },
    ];
  }

  // Tag filtering
  if (tagNames.length > 0) {
    where.tags = {
      some: {
        tag: {
          name: { in: tagNames },
        },
      },
    };
  }

  const recipes = await prisma.recipe.findMany({
    where,
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return recipes.map((r: { id: string; title: string; description: string | null; imagePath: string | null; sourceUrl: string | null; isFavorite: boolean; tags: { tag: { name: string } }[]; createdAt: Date }) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    imagePath: r.imagePath,
    sourceUrl: r.sourceUrl,
    isFavorite: r.isFavorite,
    tags: r.tags.map((rt: { tag: { name: string } }) => rt.tag.name),
    createdAt: r.createdAt.toISOString(),
  }));
}

// ─── Get all tags for the current user ───

export async function getUserTags() {
  const session = await requireAuth();

  const tags = await prisma.tag.findMany({
    where: {
      recipes: {
        some: {
          recipe: {
            userId: session.user.id,
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return tags.map((t: { name: string }) => t.name);
}
