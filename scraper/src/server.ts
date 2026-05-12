import express from "express";
import pino from "pino";
import { JobQueue } from "./queue.js";
import { scrapePage } from "./scraper.js";

const log = pino({
  level: process.env.LOG_LEVEL || "info",
  name: process.env.APP_NAME || "recipes-scraper",
});

const PORT = parseInt(process.env.PORT || "3001", 10);

// ─── Job queue ────────────────────────────────────────────────────────────────

const queue = new JobQueue(async (url: string) => {
  const result = await scrapePage(url);
  return {
    title: result.title,
    content: result.content,
    imageUrl: result.imageUrl,
    usedBrowserFallback: result.usedBrowserFallback,
  };
});

// Prune old completed/failed jobs every 30 minutes
setInterval(() => queue.prune(), 30 * 60 * 1000);

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

/**
 * POST /jobs
 * Enqueue a new scrape job.
 * Body: { jobId: string, url: string }
 * Returns: { jobId, status: "queued" } — HTTP 202
 */
app.post("/jobs", (req, res) => {
  const { jobId, url } = req.body as { jobId?: string; url?: string };

  if (!jobId || typeof jobId !== "string") {
    res.status(400).json({ error: "jobId is required" });
    return;
  }
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  // Idempotent: if job already exists, return its current state
  const existing = queue.get(jobId);
  if (existing) {
    res.status(202).json({ jobId: existing.id, status: existing.status });
    return;
  }

  const job = queue.enqueue(jobId, url);
  log.info({ jobId, url }, "Scrape job enqueued via API");

  res.status(202).json({ jobId: job.id, status: job.status });
});

/**
 * GET /jobs/:id
 * Poll the status of a scrape job.
 * Returns: { jobId, status, result?, error? }
 */
app.get("/jobs/:id", (req, res) => {
  const job = queue.get(req.params.id);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({
    jobId: job.id,
    status: job.status,
    result: job.result ?? null,
    error: job.error ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
});

/**
 * GET /health
 * Liveness probe.
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", queueLength: queue.list().filter(j => j.status === "queued").length });
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  log.info({ port: PORT }, "Scraper service started");
});
