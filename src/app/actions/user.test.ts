import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ───
const {
  mockRevalidatePath,
  mockRequireAuth,
  mockPrisma,
  mockSaveUploadedImage,
  mockDeleteImage,
  mockIsLocalMediaPath,
} = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
  },
  mockSaveUploadedImage: vi.fn(),
  mockDeleteImage: vi.fn(),
  mockIsLocalMediaPath: vi.fn(),
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

vi.mock("@/lib/image-storage", () => ({
  saveUploadedImage: (...args: unknown[]) => mockSaveUploadedImage(...args),
  deleteImage: (...args: unknown[]) => mockDeleteImage(...args),
  isLocalMediaPath: (...args: unknown[]) => mockIsLocalMediaPath(...args),
}));

// Silence the logger during tests
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
  serializeError: (e: unknown) => ({ message: e instanceof Error ? e.message : String(e) }),
}));

import {
  getUserSettings,
  getLinkedAccounts,
  uploadProfileImage,
  removeProfileImage,
  updateUserSettings,
} from "@/app/actions/user";

const DEFAULT_SESSION = {
  user: { id: "user-1", name: "Test User", email: "test@example.com" },
  expires: "2099-01-01T00:00:00.000Z",
};

describe("getUserSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns user settings", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      name: "Test User",
      image: "/media/avatar.jpg",
      autoTranslateLanguage: "nl",
      themePreference: "dark",
    });

    const result = await getUserSettings();

    expect(result).toEqual({
      name: "Test User",
      image: "/media/avatar.jpg",
      autoTranslateLanguage: "nl",
      themePreference: "dark",
    });
  });

  it("returns defaults when user record has null fields", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await getUserSettings();

    expect(result).toEqual({
      name: null,
      image: null,
      autoTranslateLanguage: null,
      themePreference: "system",
    });
  });
});

describe("getLinkedAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns linked providers for the current user", async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      { provider: "google" },
      { provider: "microsoft-entra-id" },
    ]);

    const result = await getLinkedAccounts();

    expect(result).toEqual([
      { provider: "google" },
      { provider: "microsoft-entra-id" },
    ]);
    expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { provider: true },
    });
  });

  it("returns an empty array when the user has no linked accounts", async () => {
    mockPrisma.account.findMany.mockResolvedValue([]);

    const result = await getLinkedAccounts();

    expect(result).toEqual([]);
  });
});

describe("uploadProfileImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("returns error when no file is provided", async () => {
    const formData = new FormData();

    const result = await uploadProfileImage(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No image file provided");
  });

  it("returns error when file has zero size", async () => {
    const file = new File([], "empty.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("image", file);

    const result = await uploadProfileImage(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No image file provided");
  });

  it("returns error when saveUploadedImage fails", async () => {
    const file = new File([new ArrayBuffer(100)], "photo.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("image", file);
    mockSaveUploadedImage.mockResolvedValue(null);

    const result = await uploadProfileImage(formData);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to save image");
  });

  it("uploads image and cleans up old local image", async () => {
    const file = new File([new ArrayBuffer(100)], "photo.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("image", file);
    mockSaveUploadedImage.mockResolvedValue("/media/new-avatar.jpg");
    mockPrisma.user.findUnique.mockResolvedValue({ image: "/media/old-avatar.jpg" });
    mockPrisma.user.update.mockResolvedValue({});
    mockIsLocalMediaPath.mockReturnValue(true);

    const result = await uploadProfileImage(formData);

    expect(result.success).toBe(true);
    expect(result.image).toBe("/media/new-avatar.jpg");
    expect(mockDeleteImage).toHaveBeenCalledWith("/media/old-avatar.jpg");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("does not delete old image when it is an external URL", async () => {
    const file = new File([new ArrayBuffer(100)], "photo.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("image", file);
    mockSaveUploadedImage.mockResolvedValue("/media/new-avatar.jpg");
    mockPrisma.user.findUnique.mockResolvedValue({
      image: "https://lh3.googleusercontent.com/avatar.jpg",
    });
    mockPrisma.user.update.mockResolvedValue({});
    mockIsLocalMediaPath.mockReturnValue(false);

    const result = await uploadProfileImage(formData);

    expect(result.success).toBe(true);
    expect(mockDeleteImage).not.toHaveBeenCalled();
  });
});

describe("removeProfileImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("removes image and deletes local file", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ image: "/media/avatar.jpg" });
    mockPrisma.user.update.mockResolvedValue({});
    mockIsLocalMediaPath.mockReturnValue(true);

    const result = await removeProfileImage();

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { image: null },
    });
    expect(mockDeleteImage).toHaveBeenCalledWith("/media/avatar.jpg");
  });

  it("removes image without deleting when external URL", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      image: "https://example.com/avatar.jpg",
    });
    mockPrisma.user.update.mockResolvedValue({});
    mockIsLocalMediaPath.mockReturnValue(false);

    const result = await removeProfileImage();

    expect(result.success).toBe(true);
    expect(mockDeleteImage).not.toHaveBeenCalled();
  });

  it("handles user with no existing image", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ image: null });
    mockPrisma.user.update.mockResolvedValue({});

    const result = await removeProfileImage();

    expect(result.success).toBe(true);
    expect(mockDeleteImage).not.toHaveBeenCalled();
  });
});

describe("updateUserSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(DEFAULT_SESSION);
  });

  it("updates name", async () => {
    mockPrisma.user.update.mockResolvedValue({});

    const result = await updateUserSettings({ name: "New Name" });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "New Name" },
    });
  });

  it("trims name and sets to null if empty", async () => {
    mockPrisma.user.update.mockResolvedValue({});

    const result = await updateUserSettings({ name: "   " });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: null },
    });
  });

  it("updates autoTranslateLanguage to English", async () => {
    mockPrisma.user.update.mockResolvedValue({});

    const result = await updateUserSettings({ autoTranslateLanguage: "en" });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { autoTranslateLanguage: "en" },
    });
  });

  it("updates autoTranslateLanguage to Dutch", async () => {
    mockPrisma.user.update.mockResolvedValue({});

    const result = await updateUserSettings({ autoTranslateLanguage: "nl" });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { autoTranslateLanguage: "nl" },
    });
  });

  it("updates autoTranslateLanguage to Spanish", async () => {
    mockPrisma.user.update.mockResolvedValue({});

    const result = await updateUserSettings({ autoTranslateLanguage: "es" });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { autoTranslateLanguage: "es" },
    });
  });

  it("sets autoTranslateLanguage to null (off)", async () => {
    mockPrisma.user.update.mockResolvedValue({});

    const result = await updateUserSettings({ autoTranslateLanguage: null });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { autoTranslateLanguage: null },
    });
  });

  it("ignores invalid autoTranslateLanguage values", async () => {
    mockPrisma.user.update.mockResolvedValue({});

    // Pass an invalid value via a type cast to simulate bad input
    const result = await updateUserSettings({ autoTranslateLanguage: "fr" as "en" });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("updates themePreference", async () => {
    mockPrisma.user.update.mockResolvedValue({});

    const result = await updateUserSettings({ themePreference: "dark" });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { themePreference: "dark" },
    });
  });

  it("ignores invalid themePreference", async () => {
    mockPrisma.user.update.mockResolvedValue({});

    const result = await updateUserSettings({ themePreference: "invalid" });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("returns success without updating when no valid fields provided", async () => {
    const result = await updateUserSettings({});

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("updates multiple fields at once", async () => {
    mockPrisma.user.update.mockResolvedValue({});

    const result = await updateUserSettings({
      name: "Updated Name",
      autoTranslateLanguage: "en",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Updated Name", autoTranslateLanguage: "en" },
    });
  });

  it("returns error when database update fails", async () => {
    mockPrisma.user.update.mockRejectedValue(new Error("DB connection failed"));

    const result = await updateUserSettings({ name: "Test" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("DB connection failed");
  });
});
