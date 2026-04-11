import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ───
const {
  mockRequireAuth,
  mockRevalidatePath,
  mockPrisma,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockPrisma: {
    notification: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// ─── Module mocks ───
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("@/lib/require-auth", () => ({
  requireAuth: () => mockRequireAuth(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
  serializeError: (e: unknown) => ({ message: e instanceof Error ? e.message : String(e) }),
}));

import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/app/actions/notifications";

const DEFAULT_SESSION = {
  user: { id: "user-1", name: "Test User", email: "test@example.com" },
  expires: "2099-01-01T00:00:00.000Z",
};

const MOCK_NOTIFICATION = {
  id: "notif-1",
  type: "recipe_shared",
  title: "Recipe shared with you",
  message: "Alice shared \"Carbonara\" with you.",
  isRead: false,
  createdAt: new Date("2024-06-01T12:00:00.000Z"),
  recipeId: "recipe-copy-1",
  userId: "user-1",
  sender: { id: "user-2", name: "Alice", image: null },
};

describe("getNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns serialized notifications for the current user", async () => {
    mockPrisma.notification.findMany.mockResolvedValue([MOCK_NOTIFICATION]);

    const result = await getNotifications();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "notif-1",
      type: "recipe_shared",
      title: "Recipe shared with you",
      message: "Alice shared \"Carbonara\" with you.",
      isRead: false,
      createdAt: "2024-06-01T12:00:00.000Z",
      recipeId: "recipe-copy-1",
      sender: { id: "user-2", name: "Alice", image: null },
    });
  });

  it("queries only notifications belonging to the current user", async () => {
    mockPrisma.notification.findMany.mockResolvedValue([]);

    await getNotifications();

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
      })
    );
  });

  it("returns empty array when there are no notifications", async () => {
    mockPrisma.notification.findMany.mockResolvedValue([]);

    const result = await getNotifications();

    expect(result).toEqual([]);
  });
});

describe("getUnreadNotificationCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns the unread count", async () => {
    mockPrisma.notification.count.mockResolvedValue(3);

    const result = await getUnreadNotificationCount();

    expect(result).toBe(3);
    expect(mockPrisma.notification.count).toHaveBeenCalledWith({
      where: { userId: "user-1", isRead: false },
    });
  });

  it("returns 0 when all notifications are read", async () => {
    mockPrisma.notification.count.mockResolvedValue(0);

    const result = await getUnreadNotificationCount();

    expect(result).toBe(0);
  });
});

describe("markNotificationRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns error when notification not found", async () => {
    mockPrisma.notification.findUnique.mockResolvedValue(null);

    const result = await markNotificationRead("nonexistent-id");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Notification not found.");
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
  });

  it("returns error when notification belongs to another user", async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ userId: "other-user" });

    const result = await markNotificationRead("notif-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Notification not found.");
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
  });

  it("marks own notification as read", async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ userId: "user-1" });
    mockPrisma.notification.update.mockResolvedValue({});

    const result = await markNotificationRead("notif-1");

    expect(result.success).toBe(true);
    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: "notif-1" },
      data: { isRead: true },
    });
  });

  it("revalidates relevant paths after marking read", async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ userId: "user-1" });
    mockPrisma.notification.update.mockResolvedValue({});

    await markNotificationRead("notif-1");

    expect(mockRevalidatePath).toHaveBeenCalledWith("/notifications");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("markAllNotificationsRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("marks all unread notifications as read for the current user", async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 });

    const result = await markAllNotificationsRead();

    expect(result.success).toBe(true);
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isRead: false },
      data: { isRead: true },
    });
  });

  it("revalidates relevant paths", async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await markAllNotificationsRead();

    expect(mockRevalidatePath).toHaveBeenCalledWith("/notifications");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
