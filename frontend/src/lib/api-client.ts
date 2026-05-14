"use server";

/**
 * Server-side API client for the Go backend.
 *
 * All functions run on the server (Next.js Server Components or Route Handlers).
 * They decode the NextAuth JWE session cookie and re-sign it as a plain HS256 JWS
 * that the Go backend can verify with the shared AUTH_SECRET.
 *
 * The BACKEND_URL env var must point to the Go backend service
 * (e.g. http://recipes-backend:8080 in Kubernetes, http://localhost:8080 in dev).
 */

import { getToken } from "next-auth/jwt";
import { SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Gets a signed HS256 JWS to forward as a Bearer token to the Go backend.
 * NextAuth v5 stores sessions as JWE (encrypted). The Go backend expects a
 * plain signed JWT (JWS). We decode the JWE with getToken() and re-sign the
 * payload as HS256 using the shared AUTH_SECRET.
 * Redirects to /login if not authenticated.
 * Cached per-request with React.cache() to avoid redundant re-signing.
 */
const getAuthToken = cache(async (): Promise<string> => {
  // Use the cookies() helper for reliable cookie access.
  const cookieStore = await cookies();
  const headersList = await headers();
  const reqCookies = Object.fromEntries(
    cookieStore.getAll().map((c) => [c.name, c.value])
  );

  // Decode the JWE session cookie into a plain payload object.
  const rawToken = await getToken({
    req: {
      headers: Object.fromEntries(headersList.entries()),
      cookies: reqCookies,
    } as Parameters<typeof getToken>[0]["req"],
    secret: process.env.AUTH_SECRET!,
    // Must match the secure context used during encryption.
    // NextAuth sets __Secure-authjs.session-token on HTTPS; the salt must match.
    secureCookie: true,
  });

  if (!rawToken) {
    redirect("/login");
  }

  // Re-sign the decoded payload as a plain HS256 JWS that the Go backend can verify.
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const { iat, exp, jti, ...payload } = rawToken;
  const jws = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iat)
    .setExpirationTime(exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60)
    .setJti(jti ?? crypto.randomUUID())
    .sign(secret);

  return jws;
});

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
