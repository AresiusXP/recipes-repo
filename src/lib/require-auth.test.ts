import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ───
const { mockRedirect, mockAuth } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockAuth: vi.fn(),
}));

// ─── Module mocks ───
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
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

import { requireAuth } from "@/lib/require-auth";

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session when user is authenticated", async () => {
    const session = {
      user: { id: "user-1", name: "Test User", email: "test@example.com", image: null },
      expires: "2099-01-01T00:00:00.000Z",
    };
    mockAuth.mockResolvedValue(session);

    const result = await requireAuth();

    expect(result).toEqual(session);
    expect(result.user.id).toBe("user-1");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to /login when session is null", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when session has no user", async () => {
    mockAuth.mockResolvedValue({ user: null, expires: "2099-01-01T00:00:00.000Z" });

    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when user has no id", async () => {
    mockAuth.mockResolvedValue({
      user: { name: "Test", email: "test@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
    });

    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});
