import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises
const mockReadFile = vi.fn();
vi.mock("fs/promises", () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
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

import { GET } from "@/app/media/[filename]/route";

describe("GET /media/[filename]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves a JPEG image with correct headers", async () => {
    const imageBuffer = Buffer.from("fake-jpeg-data");
    mockReadFile.mockResolvedValue(imageBuffer);

    const request = new Request("http://localhost:3000/media/test.jpg");
    const response = await GET(request, {
      params: Promise.resolve({ filename: "test.jpg" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("serves a PNG image", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("fake-png-data"));

    const request = new Request("http://localhost:3000/media/test.png");
    const response = await GET(request, {
      params: Promise.resolve({ filename: "test.png" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });

  it("serves a WebP image", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("fake-webp-data"));

    const request = new Request("http://localhost:3000/media/test.webp");
    const response = await GET(request, {
      params: Promise.resolve({ filename: "test.webp" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
  });

  it("serves a GIF image", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("fake-gif-data"));

    const request = new Request("http://localhost:3000/media/test.gif");
    const response = await GET(request, {
      params: Promise.resolve({ filename: "test.gif" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/gif");
  });

  it("returns 404 for unsupported file extensions", async () => {
    const request = new Request("http://localhost:3000/media/test.pdf");
    const response = await GET(request, {
      params: Promise.resolve({ filename: "test.pdf" }),
    });

    expect(response.status).toBe(404);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("returns 404 for missing files", async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );

    const request = new Request("http://localhost:3000/media/missing.jpg");
    const response = await GET(request, {
      params: Promise.resolve({ filename: "missing.jpg" }),
    });

    expect(response.status).toBe(404);
  });

  it("blocks path traversal with '..'", async () => {
    const request = new Request(
      "http://localhost:3000/media/..%2F..%2Fetc%2Fpasswd"
    );
    const response = await GET(request, {
      params: Promise.resolve({ filename: "../../etc/passwd" }),
    });

    expect(response.status).toBe(404);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("blocks filenames containing slashes", async () => {
    const request = new Request(
      "http://localhost:3000/media/subdir/file.jpg"
    );
    const response = await GET(request, {
      params: Promise.resolve({ filename: "subdir/file.jpg" }),
    });

    expect(response.status).toBe(404);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("returns 404 for empty filename", async () => {
    const request = new Request("http://localhost:3000/media/");
    const response = await GET(request, {
      params: Promise.resolve({ filename: "" }),
    });

    expect(response.status).toBe(404);
  });
});
