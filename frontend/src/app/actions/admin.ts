"use server";

/**
 * Admin server actions — thin proxies to the Go backend API.
 */

import {
  getAdminUsers as apiGetAdminUsers,
  banUser as apiBanUser,
  unbanUser as apiUnbanUser,
} from "@/lib/api-client";
import type { AdminUser } from "@/lib/api-client";

export type { AdminUser } from "@/lib/api-client";

export async function getAdminUsersAction(): Promise<AdminUser[]> {
  return apiGetAdminUsers();
}

// Alias used by admin page
export const listAdminUsers = getAdminUsersAction;

export async function banUserAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  return apiBanUser(id);
}

// Alias used by AdminUsersTable component
export const banUser = banUserAction;

export async function unbanUserAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  return apiUnbanUser(id);
}

// Alias used by AdminUsersTable component
export const unbanUser = unbanUserAction;

/**
 * Delete a user account (admin only).
 */
export async function deleteUser(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { auth } = await import("@/lib/auth");
  const { redirect } = await import("next/navigation");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session!.user!.id;
  const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/users/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${userId}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { success: false, error: err.error || "Failed to delete user" };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete user" };
  }
}
