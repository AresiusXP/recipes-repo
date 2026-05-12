"use server";

/**
 * Server-side API client for the Go backend.
 *
 * All functions run on the server (Next.js Server Components or Route Handlers).
 * They forward the raw NextAuth JWT as a Bearer header to the backend.
 *
 * The BACKEND_URL env var must point to the Go backend service
 * (e.g. http://recipes-backend:8080 in Kubernetes, http://localhost:8080 in dev).
 */

import { auth } from "@/lib/auth";
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Gets the raw encoded NextAuth JWT to forward as a Bearer token to the backend.
 * The Go backend validates this JWT using the shared AUTH_SECRET.
 * Redirects to /login if not authenticated.
 */
async function getAuthToken(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Use getToken() to retrieve the raw encoded JWT from the session cookie.
  // This is the token the Go backend can verify with the shared AUTH_SECRET.
  const headersList = await headers();
  const rawToken = await getToken({
    req: {
      headers: Object.fromEntries(headersList.entries()),
      cookies: Object.fromEntries(
        (headersList.get("cookie") || "")
          .split(";")
          .filter(Boolean)
          .map((c) => {
            const [k, ...v] = c.trim().split("=");
            return [k.trim(), v.join("=")];
          })
      ),
    } as Parameters<typeof getToken>[0]["req"],
    secret: process.env.AUTH_SECRET!,
  });

  if (!rawToken) {
    redirect("/login");
  }

  // getToken returns the decoded payload; we need the raw encoded string.
  // Auth.js v5 stores the session cookie as an encoded JWT — re-encode it.
  // Since the Go backend validates with the same AUTH_SECRET, we pass the
  // cookie value directly by reading it from the cookie header.
  const cookieHeader = headersList.get("cookie") || "";
  const sessionCookieName =
    process.env.NODE_ENV === "production"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
  const cookieMatch = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${sessionCookieName}=`));

  if (cookieMatch) {
    return cookieMatch.slice(sessionCookieName.length + 1);
  }

  // Fallback: should not reach here if session is valid
  redirect("/login");
}

// ─── Generic fetch wrapper ────────────────────────────────────────────────────

interface FetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function backendFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    ...options.headers,
  };

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Backend returned ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

// ─── Recipe types ─────────────────────────────────────────────────────────────

export interface RecipeListItem {
  id: string;
  title: string;
  description: string | null;
  imagePath: string | null;
  sourceUrl: string | null;
  isFavorite: boolean;
  cookThisWeekUntil: string | null;
  createdAt: string;
  tags: string[];
}

export interface Recipe extends RecipeListItem {
  ingredients: string[];
  steps: string[];
  sourceLanguage: string | null;
  isTranslatedToEnglish: boolean;
  translatedLanguage: string | null;
  hasBeenTranslated: boolean;
  sharedByUserId: string | null;
  sharedFromRecipeId: string | null;
  userId: string;
}

export interface ImportJobStatus {
  id: string;
  userId: string;
  url: string;
  status: "pending" | "scraping" | "extracting" | "done" | "failed";
  recipeId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeFormData {
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  sourceUrl?: string | null;
  imagePath?: string | null;
}

export interface ShareableUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export type AutoTranslateLanguage = "en" | "nl" | "es" | null;

export interface UserSettings {
  name: string | null;
  email: string | null;
  image: string | null;
  autoTranslateLanguage: AutoTranslateLanguage;
  themePreference: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  userId: string;
  senderUserId: string | null;
  recipeId: string | null;
  sender?: { name: string | null; email: string | null; image?: string | null } | null;
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  isBanned: boolean;
  bannedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  recipeCount: number;
  accountProviders: string[];
}

// ─── Recipe API ───────────────────────────────────────────────────────────────

export async function listRecipes(params?: {
  q?: string;
  favorites?: boolean;
  cookThisWeek?: boolean;
  tags?: string[];
}): Promise<RecipeListItem[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.favorites) qs.set("favorites", "true");
  if (params?.cookThisWeek) qs.set("cookThisWeek", "true");
  if (params?.tags?.length) params.tags.forEach((t) => qs.append("tags", t));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return backendFetch<RecipeListItem[]>(`/api/recipes${query}`);
}

export async function getRecipe(id: string): Promise<Recipe> {
  return backendFetch<Recipe>(`/api/recipes/${id}`);
}

export async function createRecipe(
  data: RecipeFormData
): Promise<{ success: boolean; recipeId?: string; error?: string }> {
  try {
    const result = await backendFetch<{ id: string }>("/api/recipes", {
      method: "POST",
      body: data,
    });
    return { success: true, recipeId: result.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create recipe" };
  }
}

export async function updateRecipe(
  id: string,
  data: RecipeFormData
): Promise<{ success: boolean; error?: string }> {
  try {
    await backendFetch(`/api/recipes/${id}`, { method: "PUT", body: data });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update recipe" };
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  await backendFetch(`/api/recipes/${id}`, { method: "DELETE" });
}

/**
 * Starts an async recipe import from a URL.
 * Returns a jobId immediately — poll getImportJobStatus() to track progress.
 */
export async function importRecipeFromUrl(
  url: string
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const result = await backendFetch<{ jobId: string; status: string }>(
      "/api/recipes/import",
      { method: "POST", body: { url } }
    );
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to start import" };
  }
}

export async function importRecipeFromText(
  text: string
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const result = await backendFetch<{ jobId: string; status: string }>(
      "/api/recipes/import/text",
      { method: "POST", body: { text } }
    );
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to start import" };
  }
}

export async function getImportJobStatus(jobId: string): Promise<ImportJobStatus> {
  return backendFetch<ImportJobStatus>(`/api/recipes/import/${jobId}`);
}

export async function translateRecipe(
  id: string,
  targetLanguage: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await backendFetch(`/api/recipes/${id}/translate`, {
      method: "POST",
      body: { targetLanguage },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to translate" };
  }
}

export async function shareRecipe(
  id: string,
  recipientUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await backendFetch(`/api/recipes/${id}/share`, {
      method: "POST",
      body: { recipientUserId },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to share" };
  }
}

export async function toggleFavorite(
  id: string
): Promise<{ success: boolean; isFavorite?: boolean; error?: string }> {
  try {
    const result = await backendFetch<{ success: boolean; isFavorite: boolean }>(
      `/api/recipes/${id}/favorite`,
      { method: "POST" }
    );
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to toggle favorite" };
  }
}

export async function setCookThisWeek(
  id: string,
  expiryDate: string
): Promise<{ success: boolean; cookThisWeekUntil?: string; error?: string }> {
  try {
    const result = await backendFetch<{ success: boolean; cookThisWeekUntil: string }>(
      `/api/recipes/${id}/cook-this-week`,
      { method: "POST", body: { expiryDate } }
    );
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to set cook this week" };
  }
}

export async function removeCookThisWeek(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await backendFetch(`/api/recipes/${id}/cook-this-week`, { method: "DELETE" });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to remove cook this week" };
  }
}

export async function getOtherUsers(): Promise<ShareableUser[]> {
  return backendFetch<ShareableUser[]>("/api/users/others");
}

// ─── User settings API ────────────────────────────────────────────────────────

export async function getUserSettings(): Promise<UserSettings> {
  return backendFetch<UserSettings>("/api/users/me/settings");
}

export async function updateUserSettings(
  settings: Partial<UserSettings>
): Promise<{ success: boolean; error?: string }> {
  try {
    await backendFetch("/api/users/me/settings", { method: "PUT", body: settings });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update settings" };
  }
}

// ─── Notifications API ────────────────────────────────────────────────────────

export async function getNotifications(): Promise<AppNotification[]> {
  return backendFetch<AppNotification[]>("/api/notifications");
}

export async function markNotificationRead(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await backendFetch(`/api/notifications/${id}/read`, { method: "POST" });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to mark as read" };
  }
}

export async function deleteNotification(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await backendFetch(`/api/notifications/${id}`, { method: "DELETE" });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete notification" };
  }
}

export async function markAllNotificationsRead(): Promise<{ success: boolean; error?: string }> {
  try {
    await backendFetch("/api/notifications/read-all", { method: "POST" });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to mark all as read" };
  }
}

// ─── Admin API ────────────────────────────────────────────────────────────────

export async function getAdminUsers(): Promise<AdminUser[]> {
  return backendFetch<AdminUser[]>("/api/admin/users");
}

export async function banUser(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await backendFetch(`/api/admin/users/${id}/ban`, { method: "POST" });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to ban user" };
  }
}

export async function unbanUser(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await backendFetch(`/api/admin/users/${id}/unban`, { method: "POST" });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to unban user" };
  }
}
