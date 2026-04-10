"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { revalidatePath } from "next/cache";
import { saveUploadedImage, deleteImage, isLocalMediaPath } from "@/lib/image-storage";
import { logger, serializeError } from "@/lib/logger";
import { cache } from "react";

// ─── Types ───

export interface UserSettings {
  name: string | null;
  image: string | null;
  translateRecipes: boolean;
  themePreference: string;
}

// ─── Get user settings ───

export const getUserSettings = cache(async (): Promise<UserSettings> => {
  const session = await requireAuth();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, image: true, translateRecipes: true, themePreference: true },
  });

  return {
    name: user?.name ?? null,
    image: user?.image ?? null,
    translateRecipes: user?.translateRecipes ?? true,
    themePreference: user?.themePreference ?? "system",
  };
});

// ─── Get theme preference safely ───

export const getThemePreference = cache(async (): Promise<string> => {
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (!session?.user?.id) return "system";

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { themePreference: true },
    });

    return user?.themePreference ?? "system";
  } catch {
    return "system";
  }
});

// ─── Upload profile image ───

export async function uploadProfileImage(
  formData: FormData
): Promise<{ success: boolean; error?: string; image?: string }> {
  const session = await requireAuth();
  const log = logger.child({ action: "uploadProfileImage", userId: session.user.id });

  log.info("Profile image upload started");

  try {
    const file = formData.get("image");

    if (!file || !(file instanceof File) || file.size === 0) {
      log.warn("Profile image upload rejected: no file provided or empty file");
      return { success: false, error: "No image file provided" };
    }

    log.debug({ fileSize: file.size, fileType: file.type }, "Saving uploaded profile image");

    // Save the uploaded file
    const newImagePath = await saveUploadedImage(file);

    if (!newImagePath) {
      log.warn({ fileSize: file.size, fileType: file.type }, "Profile image save failed: unsupported type or size limit exceeded");
      return { success: false, error: "Failed to save image. Please use a JPEG, PNG, WebP, or GIF file under 10MB." };
    }

    // Get the current image to clean up if it's a local file
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { image: true },
    });

    // Update the user record
    await prisma.user.update({
      where: { id: session.user.id },
      data: { image: newImagePath },
    });

    // Delete old local image if it exists
    if (currentUser?.image && isLocalMediaPath(currentUser.image)) {
      log.debug({ oldImagePath: currentUser.image }, "Deleting old local profile image");
      await deleteImage(currentUser.image);
    }

    log.info({ newImagePath }, "Profile image uploaded successfully");

    revalidatePath("/", "layout");
    return { success: true, image: newImagePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload profile image";
    log.error({ err: serializeError(error) }, "Unexpected error during profile image upload");
    return { success: false, error: message };
  }
}

// ─── Remove profile image ───

export async function removeProfileImage(): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const log = logger.child({ action: "removeProfileImage", userId: session.user.id });

  log.info("Profile image removal started");

  try {
    // Get the current image to clean up
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { image: true },
    });

    // Update the user record to remove the image
    await prisma.user.update({
      where: { id: session.user.id },
      data: { image: null },
    });

    // Delete old local image if it exists
    if (currentUser?.image && isLocalMediaPath(currentUser.image)) {
      log.debug({ imagePath: currentUser.image }, "Deleting local profile image file");
      await deleteImage(currentUser.image);
    }

    log.info({ hadLocalImage: !!(currentUser?.image && isLocalMediaPath(currentUser.image)) }, "Profile image removed successfully");

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove profile image";
    log.error({ err: serializeError(error) }, "Unexpected error during profile image removal");
    return { success: false, error: message };
  }
}

// ─── Update user settings ───

export async function updateUserSettings(
  data: { name?: string; translateRecipes?: boolean; themePreference?: string }
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const log = logger.child({ action: "updateUserSettings", userId: session.user.id });

  log.info({ fields: Object.keys(data) }, "User settings update started");

  try {
    const updateData: Record<string, unknown> = {};

    if (typeof data.name === "string") {
      updateData.name = data.name.trim() || null;
    }

    if (typeof data.translateRecipes === "boolean") {
      updateData.translateRecipes = data.translateRecipes;
    }

    if (typeof data.themePreference === "string" && ["light", "dark", "system"].includes(data.themePreference)) {
      updateData.themePreference = data.themePreference;
    }

    if (Object.keys(updateData).length === 0) {
      log.debug("No valid fields to update; skipping database write");
      return { success: true };
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
    });

    log.info({ updatedFields: Object.keys(updateData) }, "User settings updated successfully");

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update settings";
    log.error({ err: serializeError(error) }, "Unexpected error during user settings update");
    return { success: false, error: message };
  }
}
