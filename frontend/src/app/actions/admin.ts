"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "admin-actions" });

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  isBanned: boolean;
  bannedAt: Date | null;
  recipeCount: number;
  sessionCount: number;
  accountProviders: string[];
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  await requireAdmin();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      lastLoginAt: true,
      isBanned: true,
      bannedAt: true,
      _count: {
        select: {
          recipes: true,
          sessions: true,
        },
      },
      accounts: {
        select: { provider: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    isBanned: u.isBanned,
    bannedAt: u.bannedAt,
    recipeCount: u._count.recipes,
    sessionCount: u._count.sessions,
    accountProviders: u.accounts.map((a) => a.provider),
  }));
}

export async function banUser(
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAdmin();

  if (targetUserId === session.user.id) {
    return { success: false, error: "You cannot ban yourself." };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, isBanned: true },
  });

  if (!target) {
    return { success: false, error: "User not found." };
  }

  if (target.isBanned) {
    return { success: false, error: "User is already banned." };
  }

  // Ban the user and immediately revoke all active sessions
  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: { isBanned: true, bannedAt: new Date() },
    }),
    prisma.session.deleteMany({ where: { userId: targetUserId } }),
  ]);

  log.info({ adminId: session.user.id, targetUserId }, "User banned");
  revalidatePath("/admin");
  return { success: true };
}

export async function unbanUser(
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAdmin();

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, isBanned: true },
  });

  if (!target) {
    return { success: false, error: "User not found." };
  }

  if (!target.isBanned) {
    return { success: false, error: "User is not banned." };
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: { isBanned: false, bannedAt: null },
  });

  log.info({ adminId: session.user.id, targetUserId }, "User unbanned");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteUser(
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAdmin();

  if (targetUserId === session.user.id) {
    return { success: false, error: "You cannot delete yourself." };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });

  if (!target) {
    return { success: false, error: "User not found." };
  }

  // Cascade deletes handle accounts, sessions, recipes, notifications
  await prisma.user.delete({ where: { id: targetUserId } });

  log.info({ adminId: session.user.id, targetUserId }, "User deleted");
  revalidatePath("/admin");
  return { success: true };
}
