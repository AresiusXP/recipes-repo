"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { revalidatePath } from "next/cache";
import { logger, serializeError } from "@/lib/logger";

// ─── Types ───

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  recipeId: string | null;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
}

// ─── Get notifications for the current user ───

export async function getNotifications(): Promise<NotificationItem[]> {
  const session = await requireAuth();

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    include: {
      sender: {
        select: { id: true, name: true, image: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return notifications.map(
    (n: {
      id: string;
      type: string;
      title: string;
      message: string;
      isRead: boolean;
      createdAt: Date;
      recipeId: string | null;
      sender: { id: string; name: string | null; image: string | null } | null;
    }) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
      recipeId: n.recipeId,
      sender: n.sender,
    })
  );
}

// ─── Get unread notification count ───

export async function getUnreadNotificationCount(): Promise<number> {
  const session = await requireAuth();

  const count = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  });

  return count;
}

// ─── Mark a single notification as read ───

export async function markNotificationRead(
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const log = logger.child({
    action: "markNotificationRead",
    notificationId,
    userId: session.user.id,
  });

  try {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (!notification || notification.userId !== session.user.id) {
      log.warn("Mark-read rejected: notification not found or ownership mismatch");
      return { success: false, error: "Notification not found." };
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    log.info("Notification marked as read");

    revalidatePath("/notifications");
    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update notification";
    log.error({ err: serializeError(error) }, "Unexpected error marking notification read");
    return { success: false, error: message };
  }
}

// ─── Mark all notifications as read ───

export async function markAllNotificationsRead(): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const log = logger.child({
    action: "markAllNotificationsRead",
    userId: session.user.id,
  });

  try {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });

    log.info("All notifications marked as read");

    revalidatePath("/notifications");
    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update notifications";
    log.error({ err: serializeError(error) }, "Unexpected error marking all notifications read");
    return { success: false, error: message };
  }
}
