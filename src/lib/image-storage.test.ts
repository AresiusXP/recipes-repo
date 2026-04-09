import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockUnlink = vi.fn().mockResolvedValue(undefined);
vi.mock("fs/promises", () => ({
  default: {
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

// Mock uuid
vi.mock("uuid", () => ({
  v4: () => "test-uuid-1234",
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { downloadImage, saveUploadedImage, deleteImage, isLocalMediaPath } from "@/lib/image-storage";

describe("downloadImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads and saves a valid JPEG image", async () => {
    const imageBuffer = new ArrayBuffer(100);
    const mockHeaders = {
      get: (name: string) => {
        if (name === "content-type") return "image/jpeg";
        if (name === "content-length") return "100";
        return null;
      },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      headers: mockHeaders,
      arrayBuffer: () => Promise.resolve(imageBuffer),
    });

    const result = await downloadImage("https://example.com/photo.jpg");

    expect(result).toBe("/media/test-uuid-1234.jpg");
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("returns null for non-http protocols", async () => {
    const result = await downloadImage("ftp://example.com/photo.jpg");

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null for failed fetch", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
    });

    const result = await downloadImage("https://example.com/missing.jpg");

    expect(result).toBeNull();
  });

  it("returns null for unsupported content type", async () => {
    const mockHeaders = {
      get: (name: string) => {
        if (name === "content-type") return "application/pdf";
        if (name === "content-length") return "100";
        return null;
      },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      headers: mockHeaders,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });

    const result = await downloadImage("https://example.com/doc.pdf");

    expect(result).toBeNull();
  });

  it("returns null when content-length exceeds max size", async () => {
    const mockHeaders = {
      get: (name: string) => {
        if (name === "content-type") return "image/jpeg";
        if (name === "content-length") return String(11 * 1024 * 1024); // 11MB
        return null;
      },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      headers: mockHeaders,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });

    const result = await downloadImage("https://example.com/huge.jpg");

    expect(result).toBeNull();
  });

  it("uses correct extension for PNG", async () => {
    const mockHeaders = {
      get: (name: string) => {
        if (name === "content-type") return "image/png";
        if (name === "content-length") return "100";
        return null;
      },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      headers: mockHeaders,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });

    const result = await downloadImage("https://example.com/photo.png");

    expect(result).toBe("/media/test-uuid-1234.png");
  });

  it("uses correct extension for WebP", async () => {
    const mockHeaders = {
      get: (name: string) => {
        if (name === "content-type") return "image/webp";
        if (name === "content-length") return "100";
        return null;
      },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      headers: mockHeaders,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });

    const result = await downloadImage("https://example.com/photo.webp");

    expect(result).toBe("/media/test-uuid-1234.webp");
  });

  it("returns null for invalid URL", async () => {
    const result = await downloadImage("not-a-valid-url");

    expect(result).toBeNull();
  });
});

describe("isLocalMediaPath", () => {
  it("returns true for paths starting with /media/", () => {
    expect(isLocalMediaPath("/media/test-uuid.jpg")).toBe(true);
  });

  it("returns false for external URLs", () => {
    expect(isLocalMediaPath("https://example.com/photo.jpg")).toBe(false);
  });

  it("returns false for other local paths", () => {
    expect(isLocalMediaPath("/other/path.jpg")).toBe(false);
  });
});

describe("deleteImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the file at the correct path", async () => {
    await deleteImage("/media/test-uuid.jpg");

    expect(mockUnlink).toHaveBeenCalled();
    // Verify the path contains the filename
    const calledPath = mockUnlink.mock.calls[0][0] as string;
    expect(calledPath).toContain("test-uuid.jpg");
  });

  it("does not throw when file deletion fails", async () => {
    mockUnlink.mockRejectedValue(new Error("ENOENT"));

    // Should not throw
    await expect(deleteImage("/media/missing.jpg")).resolves.toBeUndefined();
  });
});

describe("saveUploadedImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves a valid uploaded file", async () => {
    const file = new File([new ArrayBuffer(100)], "photo.jpg", { type: "image/jpeg" });

    const result = await saveUploadedImage(file);

    expect(result).toBe("/media/test-uuid-1234.jpg");
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("returns null for unsupported file type", async () => {
    const file = new File([new ArrayBuffer(100)], "doc.pdf", { type: "application/pdf" });

    const result = await saveUploadedImage(file);

    expect(result).toBeNull();
  });

  it("returns null for oversized file", async () => {
    // Create a file mock with a size over 10MB
    const file = new File([], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });

    const result = await saveUploadedImage(file);

    expect(result).toBeNull();
  });

  it("uses correct extension for PNG upload", async () => {
    const file = new File([new ArrayBuffer(100)], "photo.png", { type: "image/png" });

    const result = await saveUploadedImage(file);

    expect(result).toBe("/media/test-uuid-1234.png");
  });
});
