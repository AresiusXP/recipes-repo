"use server";

/**
 * Recipe server actions — thin proxies to the Go backend API.
 * Components import from here; the actual logic lives in the backend.
 */

import {
  listRecipes,
  getRecipe,
  createRecipe as apiCreateRecipe,
  updateRecipe as apiUpdateRecipe,
  deleteRecipe as apiDeleteRecipe,
  importRecipeFromUrl as apiImportRecipeFromUrl,
  importRecipeFromText as apiImportRecipeFromText,
  uploadRecipeImage,
  getImportJobStatus,
  translateRecipe as apiTranslateRecipe,
  shareRecipe as apiShareRecipe,
  toggleFavorite as apiToggleFavorite,
  setCookThisWeek as apiSetCookThisWeek,
  removeCookThisWeek as apiRemoveCookThisWeek,
  getOtherUsers as apiGetOtherUsers,
  askRecipeQuestion as apiAskRecipeQuestion,
} from "@/lib/api-client";
import type {
  Recipe,
  RecipeListItem,
  RecipeFormData,
  ImportJobStatus,
  ShareableUser,
  ChatTurn,
} from "@/lib/api-client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type { Recipe, RecipeListItem, RecipeFormData, ImportJobStatus, ShareableUser, ChatTurn } from "@/lib/api-client";

// Re-export types that components expect from the old actions
export interface ImportResult {
  success: boolean;
  recipeId?: string;
  jobId?: string;
  error?: string;
  siteBlocked?: boolean;
  blockedUrl?: string;
}

export async function getRecipes(params?: {
  q?: string;
  favorites?: boolean;
  cookThisWeek?: boolean;
  tags?: string[];
}): Promise<RecipeListItem[]> {
  return listRecipes(params);
}

export async function getRecipeById(id: string): Promise<Recipe> {
  return getRecipe(id);
}

export async function createRecipeAction(
  data: RecipeFormData
): Promise<{ success: boolean; recipeId?: string; error?: string }> {
  const result = await apiCreateRecipe(data);
  if (result.success) revalidatePath("/recipes");
  return result;
}

export async function updateRecipeAction(
  id: string,
  data: RecipeFormData,
  imageAction?: string,
  imageFile?: File
): Promise<{ success: boolean; error?: string }> {
  let resolvedData = data;

  if (imageAction === "replace" && imageFile) {
    // Upload the new image first, then include the returned path in the update.
    try {
      const { path } = await uploadRecipeImage(imageFile);
      resolvedData = { ...data, imagePath: path };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Failed to upload image",
      };
    }
  } else if (imageAction === "remove") {
    // Explicitly clear the image. Send empty string as sentinel — the backend
    // treats "" as "set imagePath to null" (remove), while omitting the field
    // entirely means "leave unchanged". JSON null and absent are indistinguishable
    // in Go's *string, so we use "" as the remove sentinel.
    resolvedData = { ...data, imagePath: "" };
  }
  // imageAction === "keep" (or undefined): leave imagePath out of the payload
  // so the backend leaves the existing value unchanged.

  const result = await apiUpdateRecipe(id, resolvedData);
  if (result.success) {
    revalidatePath(`/recipes/${id}`);
    revalidatePath("/recipes");
  }
  return result;
}

export async function deleteRecipeAction(id: string): Promise<void> {
  await apiDeleteRecipe(id);
  revalidatePath("/recipes");
  redirect("/recipes");
}

export async function importRecipeFromUrlAction(
  url: string
): Promise<ImportResult> {
  const result = await apiImportRecipeFromUrl(url);
  return result;
}

export async function getImportJobStatusAction(
  jobId: string
): Promise<ImportJobStatus> {
  return getImportJobStatus(jobId);
}

export async function translateRecipeAction(
  id: string,
  targetLanguage: string | null
): Promise<{ success: boolean; error?: string }> {
  const result = await apiTranslateRecipe(id, targetLanguage);
  if (result.success) revalidatePath(`/recipes/${id}`);
  return result;
}

export async function askRecipeAssistantAction(
  id: string,
  message: string,
  history: ChatTurn[]
): Promise<{ success: boolean; reply?: string; error?: string }> {
  return apiAskRecipeQuestion(id, message, history);
}

export async function shareRecipeAction(
  id: string,
  recipientUserId: string
): Promise<{ success: boolean; error?: string }> {
  return apiShareRecipe(id, recipientUserId);
}

export async function toggleFavoriteAction(
  id: string
): Promise<{ success: boolean; isFavorite?: boolean; error?: string }> {
  const result = await apiToggleFavorite(id);
  if (result.success) revalidatePath(`/recipes/${id}`);
  return result;
}

export async function setCookThisWeekAction(
  id: string,
  expiryDate: string
): Promise<{ success: boolean; cookThisWeekUntil?: string; error?: string }> {
  const result = await apiSetCookThisWeek(id, expiryDate);
  if (result.success) revalidatePath(`/recipes/${id}`);
  return result;
}

export async function removeCookThisWeekAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const result = await apiRemoveCookThisWeek(id);
  if (result.success) revalidatePath(`/recipes/${id}`);
  return result;
}

export async function getOtherUsersAction(): Promise<ShareableUser[]> {
  return apiGetOtherUsers();
}

// ─── Aliases for backward compatibility with existing components ──────────────

export const searchRecipes = getRecipes;
export const getUserTags = async (): Promise<string[]> => {
  const recipes = await listRecipes();
  const tagSet = new Set<string>();
  recipes.forEach((r) => (r.tags ?? []).forEach((t) => tagSet.add(t)));
  return Array.from(tagSet).sort();
};
export const updateRecipe = updateRecipeAction;
export const deleteRecipe = deleteRecipeAction;
export const translateRecipe = translateRecipeAction;
export const shareRecipe = shareRecipeAction;
export const toggleFavorite = toggleFavoriteAction;
export const setCookThisWeek = setCookThisWeekAction;
export const removeCookThisWeek = removeCookThisWeekAction;
export const getOtherUsers = getOtherUsersAction;
export const importRecipeFromUrl = importRecipeFromUrlAction;

/**
 * Import a recipe from plain text (manual import).
 * Sends the text to the backend for Gemini extraction.
 * If an imageFile is provided, it is uploaded first and the resulting path
 * is passed to the backend so it can be stored on the created recipe.
 */
export async function importRecipeFromText(
  text: string,
  _sourceUrl?: string,
  imageFile?: File | null
): Promise<ImportResult> {
  let imagePath: string | null = null;

  if (imageFile) {
    try {
      const { path } = await uploadRecipeImage(imageFile);
      imagePath = path;
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Failed to upload image",
      };
    }
  }

  return apiImportRecipeFromText(text, imagePath);
}
