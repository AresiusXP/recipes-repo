import pino from "pino";

const log = pino({
  level: process.env.LOG_LEVEL || "info",
  name: process.env.APP_NAME || "recipes-scraper",
});

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface ScrapeResult {
  title: string;
  content: string;
  imageUrl: string | null;
  usedBrowserFallback?: boolean;
}

export interface Job {
  id: string;
  url: string;
  status: JobStatus;
  result?: ScrapeResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

type WorkerFn = (url: string) => Promise<ScrapeResult>;

/**
 * In-memory FIFO job queue with a single-worker processing loop.
 *
 * Jobs are held in memory. On pod restart, the backend reconciliation loop
 * will re-enqueue any jobs that were in "pending" or "scraping" state in
 * PostgreSQL.
 */
export class JobQueue {
  private jobs = new Map<string, Job>();
  private queue: string[] = []; // job IDs in order
  private running = false;
  private worker: WorkerFn;

  constructor(worker: WorkerFn) {
    this.worker = worker;
  }

  enqueue(jobId: string, url: string): Job {
    const job: Job = {
      id: jobId,
      url,
      status: "queued",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    log.info({ jobId, url }, "Job enqueued");
    this.processNext();
    return job;
  }

  get(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  private async processNext(): Promise<void> {
    if (this.running || this.queue.length === 0) return;
    this.running = true;

    const jobId = this.queue.shift()!;
    const job = this.jobs.get(jobId);
    if (!job) {
      this.running = false;
      this.processNext();
      return;
    }

    job.status = "running";
    job.updatedAt = new Date();
    log.info({ jobId, url: job.url }, "Job started");

    try {
      const result = await this.worker(job.url);
      job.status = "done";
      job.result = result;
      job.updatedAt = new Date();
      log.info({ jobId, contentLength: result.content.length }, "Job completed");
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "Unknown error";
      job.updatedAt = new Date();
      log.warn({ jobId, error: job.error }, "Job failed");
    } finally {
      this.running = false;
      // Process next job after a short yield
      setImmediate(() => this.processNext());
    }
  }

  /** Returns all jobs (for debugging/health checks). */
  list(): Job[] {
    return Array.from(this.jobs.values());
  }

  /** Prune completed/failed jobs older than maxAgeMs (default: 1 hour). */
  prune(maxAgeMs = 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, job] of this.jobs) {
      if (
        (job.status === "done" || job.status === "failed") &&
        job.updatedAt.getTime() < cutoff
      ) {
        this.jobs.delete(id);
      }
    }
  }
}
