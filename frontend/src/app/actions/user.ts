"use server";

/**
 * User server actions — thin proxies to the Go backend API.
 */

import {
  getUserSettings as apiGetUserSettings,
  updateUserSettings as apiUpdateUserSettings,
  type UserSettings,
} from "@/lib/api-client";
import { revalidatePath } from "next/cache";

export type { UserSettings } from "@/lib/api-client";

export type AutoTranslateLanguage = "en" | "nl" | "es" | null;

export interface LinkedAccount {
  provider: string;
  providerAccountId: string;
}

export async function getUserSettingsAction(): Promise<UserSettings> {
  return apiGetUserSettings();
}

// Alias used by settings page
export const getUserSettings = getUserSettingsAction;

export async function updateUserSettingsAction(
  settings: Partial<UserSettings>
): Promise<{ success: boolean; error?: string }> {
  const result = await apiUpdateUserSettings(settings);
  if (result.success) revalidatePath("/settings");
  return result;
}

// Alias used by SettingsForm component
export const updateUserSettings = updateUserSettingsAction;

/**
 * Get the theme preference for the current user.
 * Used by the root layout to set the initial theme.
 */
export async function getThemePreference(): Promise<string> {
  try {
    const settings = await apiGetUserSettings();
    return settings.themePreference || "system";
  } catch {
    return "system";
  }
}

/**
 * Get linked OAuth accounts for the current user.
 */
export async function getLinkedAccounts(): Promise<LinkedAccount[]> {
  const { auth } = await import("@/lib/auth");
  const { redirect } = await import("next/navigation");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = (session as NonNullable<typeof session>).user!.id;

  const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
  try {
    const res = await fetch(`${BACKEND_URL}/api/users/me/accounts`, {
      headers: { Authorization: `Bearer ${userId}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/**
 * Upload a profile image.
 * Sends the file as multipart/form-data to the backend.
 */
export async function uploadProfileImage(
  formData: FormData
): Promise<{ success: boolean; imagePath?: string; error?: string }> {
  const { auth } = await import("@/lib/auth");
  const { redirect } = await import("next/navigation");

  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = (session as NonNullable<typeof session>).user!.id;

  const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

  try {
    const res = await fetch(`${BACKEND_URL}/api/users/me/avatar`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userId}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { success: false, error: err.error || "Upload failed" };
    }

    const data = await res.json();
    revalidatePath("/settings");
    return { success: true, imagePath: data.imagePath };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Upload failed",
    };
  }
}

/**
 * Remove the current user's profile image.
 */
export async function removeProfileImage(): Promise<{ success: boolean; error?: string }> {
  const { auth } = await import("@/lib/auth");
  const { redirect } = await import("next/navigation");

  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = (session as NonNullable<typeof session>).user!.id;

  const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

  try {
    const res = await fetch(`${BACKEND_URL}/api/users/me/avatar`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${userId}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { success: false, error: err.error || "Failed to remove image" };
    }
    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to remove image" };
  }
}

