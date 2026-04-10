"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { revalidatePath } from "next/cache";
import { saveUploadedImage, deleteImage, isLocalMediaPath } from "@/lib/image-storage";
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

  try {
    const file = formData.get("image");

    if (!file || !(file instanceof File) || file.size === 0) {
      return { success: false, error: "No image file provided" };
    }

    // Save the uploaded file
    const newImagePath = await saveUploadedImage(file);

    if (!newImagePath) {
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
      await deleteImage(currentUser.image);
    }

    revalidatePath("/", "layout");
    return { success: true, image: newImagePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload profile image";
    return { success: false, error: message };
  }
}

// ─── Remove profile image ───

export async function removeProfileImage(): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();

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
      await deleteImage(currentUser.image);
    }

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove profile image";
    return { success: false, error: message };
  }
}

// ─── Update user settings ───

export async function updateUserSettings(
  data: { name?: string; translateRecipes?: boolean; themePreference?: string }
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();

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
      return { success: true };
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update settings";
    return { success: false, error: message };
  }
}
