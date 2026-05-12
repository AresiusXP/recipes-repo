import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobQueue } from "../queue.js";

describe("JobQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("enqueues a job and returns it with status queued", () => {
    const worker = vi.fn().mockResolvedValue({
      title: "Test",
      content: "content",
      imageUrl: null,
    });
    const q = new JobQueue(worker);
    const job = q.enqueue("job-1", "https://example.com");
    expect(job.id).toBe("job-1");
    expect(job.status).toBe("queued");
  });

  it("processes a job and sets status to done", async () => {
    const worker = vi.fn().mockResolvedValue({
      title: "Test Recipe",
      content: "Some content",
      imageUrl: "https://example.com/img.jpg",
    });
    const q = new JobQueue(worker);
    q.enqueue("job-2", "https://example.com/recipe");

    // Allow the async worker to complete
    await vi.runAllTimersAsync();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const job = q.get("job-2");
    expect(job?.status).toBe("done");
    expect(job?.result?.title).toBe("Test Recipe");
    expect(worker).toHaveBeenCalledWith("https://example.com/recipe");
  });

  it("sets status to failed when worker throws", async () => {
    const worker = vi.fn().mockRejectedValue(new Error("Network error"));
    const q = new JobQueue(worker);
    q.enqueue("job-3", "https://example.com/bad");

    await vi.runAllTimersAsync();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const job = q.get("job-3");
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe("Network error");
  });

  it("returns undefined for unknown job id", () => {
    const q = new JobQueue(vi.fn());
    expect(q.get("nonexistent")).toBeUndefined();
  });

  it("prunes old completed jobs", async () => {
    const worker = vi.fn().mockResolvedValue({
      title: "T",
      content: "c",
      imageUrl: null,
    });
    const q = new JobQueue(worker);
    q.enqueue("job-4", "https://example.com");

    await vi.runAllTimersAsync();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    // Advance time past the prune threshold (1 hour)
    vi.advanceTimersByTime(61 * 60 * 1000);
    q.prune();

    expect(q.get("job-4")).toBeUndefined();
  });
});
