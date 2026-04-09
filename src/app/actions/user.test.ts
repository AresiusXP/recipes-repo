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

import {
  getUserSettings,
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
      translateRecipes: false,
    });

    const result = await getUserSettings();

    expect(result).toEqual({
      name: "Test User",
      image: "/media/avatar.jpg",
      translateRecipes: false,
    });
  });

  it("returns defaults when user record has null fields", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await getUserSettings();

    expect(result).toEqual({
      name: null,
      image: null,
      translateRecipes: true,
    });
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

  it("updates translateRecipes preference", async () => {
    mockPrisma.user.update.mockResolvedValue({});

    const result = await updateUserSettings({ translateRecipes: false });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { translateRecipes: false },
    });
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
      translateRecipes: true,
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Updated Name", translateRecipes: true },
    });
  });

  it("returns error when database update fails", async () => {
    mockPrisma.user.update.mockRejectedValue(new Error("DB connection failed"));

    const result = await updateUserSettings({ name: "Test" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("DB connection failed");
  });
});
