"use server";

/**
 * Admin server actions — thin proxies to the Go backend API.
 */

import {
  getAdminUsers as apiGetAdminUsers,
  banUser as apiBanUser,
  unbanUser as apiUnbanUser,
  deleteUser as apiDeleteUser,
  getAdminInfo as apiGetAdminInfo,
} from "@/lib/api-client";
import type { AdminUser, AdminInfo } from "@/lib/api-client";

export type { AdminUser } from "@/lib/api-client";
export type { AdminInfo, ServiceVersions } from "@/lib/api-client";

export async function getAdminUsersAction(): Promise<AdminUser[]> {
  return apiGetAdminUsers();
}

// Alias used by admin page
export const listAdminUsers = getAdminUsersAction;

/**
 * Fetch deployment info (running service versions) for the admin page.
 */
export async function getAdminInfo(): Promise<AdminInfo> {
  return apiGetAdminInfo();
}

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
  return apiDeleteUser(id);
}
