"use server";

/**
 * Notification server actions — thin proxies to the Go backend API.
 */

import {
  getNotifications as apiGetNotifications,
  markNotificationRead as apiMarkNotificationRead,
  deleteNotification as apiDeleteNotification,
  markAllNotificationsRead as apiMarkAllNotificationsRead,
  type AppNotification,
} from "@/lib/api-client";
import { revalidatePath } from "next/cache";

export type { AppNotification as Notification } from "@/lib/api-client";

// NotificationItem is an alias for Notification (used by some components)
export type NotificationItem = AppNotification;

export async function getNotificationsAction(): Promise<AppNotification[]> {
  return apiGetNotifications();
}

// Alias used by notifications page
export const getNotifications = getNotificationsAction;

export async function markNotificationReadAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const result = await apiMarkNotificationRead(id);
  if (result.success) revalidatePath("/notifications");
  return result;
}

// Alias used by NotificationsList component
export const markNotificationRead = markNotificationReadAction;

export async function deleteNotificationAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const result = await apiDeleteNotification(id);
  if (result.success) revalidatePath("/notifications");
  return result;
}

// Alias used by NotificationsList component
export const dismissNotification = deleteNotificationAction;

/**
 * Mark all notifications as read for the current user.
 */
export async function markAllNotificationsRead(): Promise<{ success: boolean; error?: string }> {
  const result = await apiMarkAllNotificationsRead();
  if (result.success) revalidatePath("/notifications");
  return result;
}

/**
 * Get the count of unread notifications for the current user.
 * Used by the Navbar to show a badge.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const notifications = await apiGetNotifications();
    return notifications.filter((n) => !n.isRead).length;
  } catch {
    return 0;
  }
}

