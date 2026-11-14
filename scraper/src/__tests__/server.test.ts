import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../server.js";

vi.mock("../scraper.js", () => ({
  scrapePage: vi.fn(async () => ({
    title: "Test recipe",
    content: "Test content",
    imageUrl: null,
  })),
}));

describe("scraper HTTP API", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer(app);

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not bind to a TCP port");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  });

  it("returns 400 for a POST /jobs request with no body", async () => {
    const response = await fetch(`${baseUrl}/jobs`, { method: "POST" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "jobId is required" });
  });

  it("returns 400 when jobId is missing", async () => {
    const response = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/recipe" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "jobId is required" });
  });

  it("returns 400 when url is missing", async () => {
    const response = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "test-job" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "url is required" });
  });

  it("accepts a valid job request", async () => {
    const response = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "test-job", url: "https://example.com/recipe" }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ jobId: "test-job", status: "queued" });
  });

  it("returns 404 for an unknown job", async () => {
    const response = await fetch(`${baseUrl}/jobs/missing-job`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Job not found" });
  });

  it("returns a healthy status", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });
});
