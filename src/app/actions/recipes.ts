"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { scrapePage } from "@/lib/scraper";
import { extractRecipeWithGemini, translateRecipeWithGemini } from "@/lib/gemini";
import { downloadImage, deleteImage, duplicateImage, saveUploadedImage, isLocalMediaPath } from "@/lib/image-storage";
import { logger, serializeError } from "@/lib/logger";
import { parseDayMonthYear } from "@/lib/cook-this-week";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";

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
  const operationId = randomUUID();
  const log = logger.child({ action: "importRecipeFromUrl", operationId, userId: session.user.id });

  log.info({ url }, "Recipe import from URL started");

  try {
    // Validate URL
    new URL(url);
  } catch {
    log.warn({ url }, "Recipe import rejected: invalid URL");
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
      log.debug({ url }, "Scraping page");
      scraped = await scrapePage(url);
      log.debug({ url, contentLength: scraped.content.length, hasImage: !!scraped.imageUrl }, "Page scraped successfully");
    } catch (scrapeError) {
      const msg = scrapeError instanceof Error ? scrapeError.message : "Unknown error";
      log.warn({ url, err: serializeError(scrapeError) }, "Page scraping failed");
      return {
        success: false,
        error: `Could not fetch the page: ${msg}. Try pasting the recipe text manually.`,
      };
    }

    // Extract recipe with Gemini
    let recipe;
    try {
      log.debug({ url, translateToEnglish }, "Extracting recipe with Gemini");
      recipe = await extractRecipeWithGemini(scraped.content, url, { translateToEnglish });
      log.debug({ url, detectedLanguage: recipe.detectedLanguage, tagCount: recipe.tags.length }, "Gemini extraction succeeded");
    } catch (aiError) {
      const msg = aiError instanceof Error ? aiError.message : "Unknown error";
      log.warn({ url, err: serializeError(aiError) }, "Gemini recipe extraction failed");
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
        log.warn({ url, imageUrl: absoluteImageUrl }, "Image download returned null; continuing without image");
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

    log.info(
      {
        recipeId: created.id,
        url,
        title: recipe.title,
        detectedLanguage: recipe.detectedLanguage,
        isTranslatedToEnglish: isEnglish || isTranslatedToEnglish,
        hasImage: !!imagePath,
      },
      "Recipe imported successfully from URL"
    );

    revalidatePath("/recipes");
    return { success: true, recipeId: created.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import recipe";
    log.error({ url, err: serializeError(error) }, "Unexpected error during recipe import from URL");
    return { success: false, error: message };
  }
}

// ─── Import from manual text ───

export async function importRecipeFromText(
  text: string,
  sourceUrl?: string,
  imageFile?: File | null
): Promise<ImportResult> {
  const session = await requireAuth();
  const operationId = randomUUID();
  const log = logger.child({ action: "importRecipeFromText", operationId, userId: session.user.id });

  log.info({ textLength: text.length, hasSourceUrl: !!sourceUrl, hasImage: !!imageFile }, "Recipe import from text started");

  if (!text.trim()) {
    log.warn("Recipe import rejected: empty text");
    return { success: false, error: "Recipe text cannot be empty" };
  }

  try {
    // Load user translation preference
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { translateRecipes: true },
    });
    const translateToEnglish = user?.translateRecipes ?? true;

    log.debug({ translateToEnglish }, "Extracting recipe from text with Gemini");
    const recipe = await extractRecipeWithGemini(
      text,
      sourceUrl || "manual entry",
      { translateToEnglish }
    );
    log.debug({ detectedLanguage: recipe.detectedLanguage, tagCount: recipe.tags.length }, "Gemini extraction succeeded");

    const tagRecords = await Promise.all(
      recipe.tags.map(async (name) => {
        return prisma.tag.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      })
    );

    // Save uploaded image if provided
    let imagePath: string | null = null;
    if (imageFile && imageFile.size > 0) {
      log.debug({ fileSize: imageFile.size, fileType: imageFile.type }, "Saving uploaded recipe image");
      imagePath = await saveUploadedImage(imageFile);
      if (!imagePath) {
        log.warn({ fileSize: imageFile.size, fileType: imageFile.type }, "Recipe image save failed: unsupported type or size limit exceeded");
        return { success: false, error: "Failed to save image. Please use a JPEG, PNG, WebP, or GIF file under 10MB." };
      }
    }

    // Determine translation state
    const isEnglish = recipe.detectedLanguage === "en";
    const isTranslatedToEnglish = !isEnglish && translateToEnglish;

    const created = await prisma.recipe.create({
      data: {
        title: recipe.title,
        description: recipe.description,
        sourceUrl: sourceUrl || null,
        imagePath,
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

    log.info(
      {
        recipeId: created.id,
        title: recipe.title,
        detectedLanguage: recipe.detectedLanguage,
        isTranslatedToEnglish: isEnglish || isTranslatedToEnglish,
        hasImage: !!imagePath,
      },
      "Recipe imported successfully from text"
    );

    revalidatePath("/recipes");
    return { success: true, recipeId: created.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process recipe";
    log.error({ err: serializeError(error) }, "Unexpected error during recipe import from text");
    return { success: false, error: message };
  }
}

// ─── Translate existing recipe ───

export async function translateRecipe(
  recipeId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const operationId = randomUUID();
  const log = logger.child({ action: "translateRecipe", operationId, recipeId, userId: session.user.id });

  log.info("Recipe translation started");

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
    log.warn("Translation rejected: recipe not found or ownership mismatch");
    return { success: false, error: "Recipe not found" };
  }

  if (recipe.isTranslatedToEnglish) {
    log.info("Translation skipped: recipe is already translated to English");
    return { success: true }; // Already translated
  }

  if (recipe.sourceLanguage === "en") {
    // Already in English, just mark it
    log.info({ sourceLanguage: recipe.sourceLanguage }, "Translation skipped: recipe source language is English; marking as translated");
    await prisma.recipe.update({
      where: { id: recipeId },
      data: { isTranslatedToEnglish: true },
    });
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
    return { success: true };
  }

  try {
    log.debug({ sourceLanguage: recipe.sourceLanguage }, "Translating recipe content with Gemini");
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

    log.info({ sourceLanguage: recipe.sourceLanguage }, "Recipe translated to English successfully");

    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to translate recipe";
    log.error({ err: serializeError(error) }, "Unexpected error during recipe translation");
    return { success: false, error: message };
  }
}

// ─── Update recipe ───

export async function updateRecipe(
  recipeId: string,
  data: RecipeFormData,
  imageAction: "keep" | "replace" | "remove" = "keep",
  imageFile?: File | null
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const operationId = randomUUID();
  const log = logger.child({ action: "updateRecipe", operationId, recipeId, userId: session.user.id });

  log.info({ imageAction, hasNewImage: !!imageFile }, "Recipe update started");

  // Verify ownership and fetch current imagePath
  const existing = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true, imagePath: true },
  });

  if (!existing || existing.userId !== session.user.id) {
    log.warn("Update rejected: recipe not found or ownership mismatch");
    return { success: false, error: "Recipe not found" };
  }

  // Resolve the new imagePath
  let newImagePath: string | null | undefined = undefined; // undefined = no change

  if (imageAction === "remove") {
    newImagePath = null;
  } else if (imageAction === "replace" && imageFile && imageFile.size > 0) {
    log.debug({ fileSize: imageFile.size, fileType: imageFile.type }, "Saving new recipe image");
    const saved = await saveUploadedImage(imageFile);
    if (!saved) {
      log.warn({ fileSize: imageFile.size, fileType: imageFile.type }, "New recipe image save failed");
      return { success: false, error: "Failed to save image. Please use a JPEG, PNG, WebP, or GIF file under 10MB." };
    }
    newImagePath = saved;
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

    // Build recipe update data
    const recipeUpdateData: Record<string, unknown> = {
      title: data.title,
      description: data.description,
      ingredients: JSON.stringify(data.ingredients),
      steps: JSON.stringify(data.steps),
      tags: {
        create: tagRecords.map((tag: { id: string; name: string }) => ({
          tagId: tag.id,
        })),
      },
    };

    if (newImagePath !== undefined) {
      recipeUpdateData.imagePath = newImagePath;
    }

    // Delete existing tag associations and update recipe in a transaction
    await prisma.$transaction([
      prisma.recipeTag.deleteMany({
        where: { recipeId },
      }),
      prisma.recipe.update({
        where: { id: recipeId },
        data: recipeUpdateData,
      }),
    ]);

    // Delete the old image file after the DB update succeeds
    if (newImagePath !== undefined && existing.imagePath && isLocalMediaPath(existing.imagePath)) {
      log.debug({ oldImagePath: existing.imagePath }, "Deleting old recipe image file");
      await deleteImage(existing.imagePath);
    }

    log.info({ tagCount: tagRecords.length, imageAction }, "Recipe updated successfully");

    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update recipe";
    log.error({ err: serializeError(error) }, "Unexpected error during recipe update");
    return { success: false, error: message };
  }
}

// ─── Delete recipe ───

export async function deleteRecipe(recipeId: string): Promise<void> {
  const session = await requireAuth();
  const log = logger.child({ action: "deleteRecipe", recipeId, userId: session.user.id });

  log.info("Recipe deletion started");

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true, imagePath: true },
  });

  if (!recipe || recipe.userId !== session.user.id) {
    log.warn("Deletion rejected: recipe not found or ownership mismatch");
    return;
  }

  // Delete the image file if it exists and is a local file
  if (recipe.imagePath && isLocalMediaPath(recipe.imagePath)) {
    log.debug({ imagePath: recipe.imagePath }, "Deleting recipe image file");
    await deleteImage(recipe.imagePath);
  }

  await prisma.recipe.delete({
    where: { id: recipeId },
  });

  log.info({ hadImage: !!recipe.imagePath }, "Recipe deleted successfully");

  revalidatePath("/recipes");
  redirect("/recipes");
}

// ─── Cook This Week ───

export async function setCookThisWeek(
  recipeId: string,
  expiryDateStr: string
): Promise<{ success: boolean; cookThisWeekUntil?: string; error?: string }> {
  const session = await requireAuth();
  const log = logger.child({ action: "setCookThisWeek", recipeId, userId: session.user.id });

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true },
  });

  if (!recipe || recipe.userId !== session.user.id) {
    log.warn("setCookThisWeek rejected: recipe not found or ownership mismatch");
    return { success: false, error: "Recipe not found" };
  }

  let expiryDate: Date;
  try {
    expiryDate = parseDayMonthYear(expiryDateStr);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid date";
    log.warn({ expiryDateStr }, "setCookThisWeek rejected: invalid date");
    return { success: false, error: message };
  }

  const updated = await prisma.recipe.update({
    where: { id: recipeId },
    data: { cookThisWeekUntil: expiryDate },
    select: { cookThisWeekUntil: true },
  });

  log.info({ expiryDate }, "Recipe marked as cook-this-week");

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);

  return {
    success: true,
    cookThisWeekUntil: updated.cookThisWeekUntil?.toISOString(),
  };
}

export async function removeCookThisWeek(
  recipeId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const log = logger.child({ action: "removeCookThisWeek", recipeId, userId: session.user.id });

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true },
  });

  if (!recipe || recipe.userId !== session.user.id) {
    log.warn("removeCookThisWeek rejected: recipe not found or ownership mismatch");
    return { success: false, error: "Recipe not found" };
  }

  await prisma.recipe.update({
    where: { id: recipeId },
    data: { cookThisWeekUntil: null },
  });

  log.info("Cook-this-week mark removed");

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);

  return { success: true };
}

// ─── Toggle favorite ───

export async function toggleFavorite(
  recipeId: string
): Promise<{ success: boolean; isFavorite?: boolean; error?: string }> {
  const session = await requireAuth();
  const log = logger.child({ action: "toggleFavorite", recipeId, userId: session.user.id });

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { userId: true, isFavorite: true },
  });

  if (!recipe || recipe.userId !== session.user.id) {
    log.warn("Toggle favorite rejected: recipe not found or ownership mismatch");
    return { success: false, error: "Recipe not found" };
  }

  const updated = await prisma.recipe.update({
    where: { id: recipeId },
    data: { isFavorite: !recipe.isFavorite },
    select: { isFavorite: true },
  });

  log.info({ isFavorite: updated.isFavorite }, "Recipe favorite status toggled");

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes/favorites");

  return { success: true, isFavorite: updated.isFavorite };
}

// ─── Search & filter ───

export async function searchRecipes(
  query: string,
  tagNames: string[],
  favoritesOnly = false,
  cookThisWeekOnly = false
) {
  const session = await requireAuth();

  const where: Record<string, unknown> = {
    userId: session.user.id,
  };

  if (favoritesOnly) {
    where.isFavorite = true;
  }

  if (cookThisWeekOnly) {
    // Compare against the start of today in UTC so recipes are visible for the
    // full calendar date they were marked until, regardless of the time of day.
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    where.cookThisWeekUntil = { gte: startOfToday };
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

  return recipes.map((r: { id: string; title: string; description: string | null; imagePath: string | null; sourceUrl: string | null; isFavorite: boolean; cookThisWeekUntil: Date | null; tags: { tag: { name: string } }[]; createdAt: Date }) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    imagePath: r.imagePath,
    sourceUrl: r.sourceUrl,
    isFavorite: r.isFavorite,
    cookThisWeekUntil: r.cookThisWeekUntil ? r.cookThisWeekUntil.toISOString() : null,
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

// ─── List other users (for share picker) ───

export interface ShareableUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export async function getOtherUsers(): Promise<ShareableUser[]> {
  const session = await requireAuth();

  const users = await prisma.user.findMany({
    where: { id: { not: session.user.id } },
    select: { id: true, name: true, email: true, image: true },
    orderBy: { name: "asc" },
  });

  return users;
}

// ─── Share recipe ───

export async function shareRecipe(
  recipeId: string,
  recipientUserId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const operationId = randomUUID();
  const log = logger.child({ action: "shareRecipe", operationId, recipeId, userId: session.user.id, recipientUserId });

  log.info("Recipe share started");

  if (recipientUserId === session.user.id) {
    log.warn("Share rejected: cannot share recipe with yourself");
    return { success: false, error: "You cannot share a recipe with yourself." };
  }

  // Load source recipe, verify ownership
  const source = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { tags: { include: { tag: true } } },
  });

  if (!source || source.userId !== session.user.id) {
    log.warn("Share rejected: recipe not found or ownership mismatch");
    return { success: false, error: "Recipe not found." };
  }

  // Verify recipient exists
  const recipient = await prisma.user.findUnique({
    where: { id: recipientUserId },
    select: { id: true, name: true },
  });

  if (!recipient) {
    log.warn("Share rejected: recipient user not found");
    return { success: false, error: "Recipient user not found." };
  }

  // Prevent sharing the same recipe to the same recipient more than once
  const existingShare = await prisma.recipe.findFirst({
    where: { userId: recipientUserId, sharedFromRecipeId: source.id },
    select: { id: true },
  });

  if (existingShare) {
    log.warn("Share rejected: recipe already shared with this recipient");
    return { success: false, error: "You have already shared this recipe with that user." };
  }

  // Duplicate image so deletion of either copy doesn't affect the other
  const copiedImagePath = source.imagePath
    ? await duplicateImage(source.imagePath)
    : null;

  const tagNames = source.tags.map((rt: { tag: { name: string } }) => rt.tag.name);
  const senderName = session.user.name ?? session.user.email ?? "Someone";

  try {
    // Upsert tags + create recipe copy + notification all in one transaction
    const copied = await prisma.$transaction(async (tx) => {
      // Upsert tags inside the transaction
      const tagRecords = await Promise.all(
        tagNames.map(async (name: string) => {
          return tx.tag.upsert({
            where: { name },
            update: {},
            create: { name },
          });
        })
      );

      const newRecipe = await tx.recipe.create({
        data: {
          title: source.title,
          description: source.description,
          sourceUrl: source.sourceUrl,
          imagePath: copiedImagePath,
          ingredients: source.ingredients,
          steps: source.steps,
          rawContent: source.rawContent,
          sourceLanguage: source.sourceLanguage,
          isTranslatedToEnglish: source.isTranslatedToEnglish,
          isFavorite: false,
          sharedByUserId: session.user.id,
          sharedFromRecipeId: source.id,
          userId: recipientUserId,
          tags: {
            create: tagRecords.map((tag: { id: string; name: string }) => ({
              tagId: tag.id,
            })),
          },
        },
      });

      await tx.notification.create({
        data: {
          type: "recipe_shared",
          title: "Recipe shared with you",
          message: `${senderName} shared "${source.title}" with you.`,
          userId: recipientUserId,
          senderUserId: session.user.id,
          recipeId: newRecipe.id,
        },
      });

      return newRecipe;
    });

    log.info({ copiedRecipeId: copied.id }, "Recipe shared successfully");

    revalidatePath("/recipes");
    revalidatePath("/notifications");

    return { success: true };
  } catch (error) {
    // If the transaction failed and we already duplicated the image, clean it up
    if (copiedImagePath && copiedImagePath !== source.imagePath) {
      await deleteImage(copiedImagePath);
    }
    const message = error instanceof Error ? error.message : "Failed to share recipe";
    log.error({ err: serializeError(error) }, "Unexpected error during recipe share");
    return { success: false, error: message };
  }
}
