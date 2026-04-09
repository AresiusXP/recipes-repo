"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { revalidatePath } from "next/cache";

// ─── Types ───

export interface UserSettings {
  name: string | null;
  translateRecipes: boolean;
}

// ─── Get user settings ───

export async function getUserSettings(): Promise<UserSettings> {
  const session = await requireAuth();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, translateRecipes: true },
  });

  return {
    name: user?.name ?? null,
    translateRecipes: user?.translateRecipes ?? true,
  };
}

// ─── Update user settings ───

export async function updateUserSettings(
  data: { name?: string; translateRecipes?: boolean }
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

    if (Object.keys(updateData).length === 0) {
      return { success: true };
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update settings";
    return { success: false, error: message };
  }
}
